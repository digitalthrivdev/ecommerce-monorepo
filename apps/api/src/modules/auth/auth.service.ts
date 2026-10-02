import type Redis from "ioredis";

import type { PrismaClient, UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import type { OtpRegistry } from "./otp-registry.js";

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

/** What is kept in Redis between sending and verifying: never the code itself. */
type PendingOtp = { provider: string; reference: string };

type AuthServiceDeps = {
  prisma: PrismaClient;
  redis: Redis;
  otp: Pick<OtpRegistry, "forPhone" | "byName">;
  signToken: (payload: { sub: string; role: UserRole }) => string;
};

function readPending(value: string | null): PendingOtp | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PendingOtp>;
    return typeof parsed.provider === "string" && typeof parsed.reference === "string"
      ? { provider: parsed.provider, reference: parsed.reference }
      : null;
  } catch {
    return null;
  }
}

export function createAuthService({ prisma, redis, otp, signToken }: AuthServiceDeps) {
  const invalidOtp = () => new AppError(401, "INVALID_OTP", "OTP is invalid or has expired");

  async function sendOtp(phone: string) {
    const otpProvider = await otp.forPhone(phone);

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

    let pending: PendingOtp;
    try {
      const { reference } = await otpProvider.start(phone);
      pending = { provider: otpProvider.name, reference };
    } catch (error) {
      // Nothing was sent, so the customer may retry straight away.
      await redis.multi().del(keys.cooldown(phone)).decr(keys.sends(phone)).exec();
      throw error;
    }

    await redis
      .multi()
      .set(keys.otp(phone), JSON.stringify(pending), "EX", OTP_TTL_SECONDS)
      .del(keys.attempts(phone))
      .exec();

    return { expiresInSeconds: OTP_TTL_SECONDS };
  }

  async function verifyOtp(phone: string, code: string) {
    const pending = readPending(await redis.get(keys.otp(phone)));
    const otpProvider = pending && (await otp.byName(pending.provider));
    if (!pending || !otpProvider) {
      throw invalidOtp();
    }

    const attempts = await redis.incr(keys.attempts(phone));
    if (attempts === 1) {
      await redis.expire(keys.attempts(phone), OTP_TTL_SECONDS);
    }
    const tooManyAttempts = () =>
      new AppError(429, "OTP_ATTEMPTS_EXCEEDED", "Too many incorrect attempts. Request a new OTP.");
    if (attempts > MAX_VERIFY_ATTEMPTS) {
      await redis.del(keys.otp(phone), keys.attempts(phone));
      throw tooManyAttempts();
    }

    const result = await otpProvider.check({ phone, code, reference: pending.reference });
    if (result !== "valid") {
      if (result !== "invalid") {
        await redis.del(keys.otp(phone), keys.attempts(phone));
      }
      throw result === "too-many-attempts" ? tooManyAttempts() : invalidOtp();
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
