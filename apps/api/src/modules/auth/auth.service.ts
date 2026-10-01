import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type Redis from "ioredis";

import { env } from "../../config/env.js";
import type { PrismaClient, UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { OtpSender } from "./otp-sender.js";

const OTP_TTL_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

const keys = {
  otp: (phone: string) => `otp:${phone}`,
  attempts: (phone: string) => `otp:attempts:${phone}`,
  cooldown: (phone: string) => `otp:cooldown:${phone}`,
  sends: (phone: string) => `otp:sends:${phone}`,
};

type AuthServiceDeps = {
  prisma: PrismaClient;
  redis: Redis;
  otpSender: OtpSender;
  signToken: (payload: { sub: string; role: UserRole }) => string;
};

function hashOtp(phone: string, otp: string) {
  return createHmac("sha256", env.JWT_SECRET).update(`${phone}:${otp}`).digest("hex");
}

function hashesMatch(a: string, b: string) {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

export function createAuthService({ prisma, redis, otpSender, signToken }: AuthServiceDeps) {
  async function sendOtp(phone: string) {
    const sends = await redis.incr(keys.sends(phone));
    if (sends === 1) {
      await redis.expire(keys.sends(phone), 3600);
    }
    if (sends > MAX_SENDS_PER_HOUR) {
      throw new AppError(429, "OTP_LIMIT_REACHED", "Too many OTP requests. Try again later.");
    }

    const cooldownSet = await redis.set(
      keys.cooldown(phone),
      "1",
      "EX",
      RESEND_COOLDOWN_SECONDS,
      "NX",
    );
    if (!cooldownSet) {
      throw new AppError(
        429,
        "OTP_COOLDOWN",
        `Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting another OTP.`,
      );
    }

    const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");

    await redis
      .multi()
      .set(keys.otp(phone), hashOtp(phone, otp), "EX", OTP_TTL_SECONDS)
      .del(keys.attempts(phone))
      .exec();

    await otpSender.send(phone, otp);

    return { expiresInSeconds: OTP_TTL_SECONDS };
  }

  async function verifyOtp(phone: string, otp: string) {
    const storedHash = await redis.get(keys.otp(phone));
    if (!storedHash) {
      throw new AppError(401, "INVALID_OTP", "OTP is invalid or has expired");
    }

    const attempts = await redis.incr(keys.attempts(phone));
    if (attempts === 1) {
      await redis.expire(keys.attempts(phone), OTP_TTL_SECONDS);
    }
    if (attempts > MAX_VERIFY_ATTEMPTS) {
      await redis.del(keys.otp(phone), keys.attempts(phone));
      throw new AppError(
        429,
        "OTP_ATTEMPTS_EXCEEDED",
        "Too many incorrect attempts. Request a new OTP.",
      );
    }

    if (!hashesMatch(storedHash, hashOtp(phone, otp))) {
      throw new AppError(401, "INVALID_OTP", "OTP is invalid or has expired");
    }

    await redis.del(keys.otp(phone), keys.attempts(phone));

    const user = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone },
      select: { id: true, phone: true, name: true, email: true, role: true },
    });

    const accessToken = signToken({ sub: user.id, role: user.role });

    return { accessToken, user };
  }

  return { sendOtp, verifyOtp };
}
