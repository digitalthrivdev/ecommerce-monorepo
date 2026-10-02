import type Redis from "ioredis";

import { env } from "../../config/env.js";
import type { PrismaClient, UserRole } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { verifyAgainstDummy, verifyPassword } from "../../shared/password.js";
import { signsInWithPassword } from "../../shared/roles.js";
import type { OtpRegistry } from "./otp-registry.js";

const OTP_TTL_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

const LOGIN_WINDOW_SECONDS = 900;
const MAX_LOGIN_ATTEMPTS = 10;
const MAX_IP_LOGIN_ATTEMPTS_PER_HOUR = 50;

const keys = {
  otp: (phone: string) => `otp:${phone}`,
  attempts: (phone: string) => `otp:attempts:${phone}`,
  cooldown: (phone: string) => `otp:cooldown:${phone}`,
  sends: (phone: string) => `otp:sends:${phone}`,
  ipSends: (ip: string) => `otp:ip-sends:${ipBucket(ip)}`,
  // Per email and network, so a stranger guessing passwords cannot lock the real person out.
  login: (email: string, ip: string) => `login:attempts:${ipBucket(ip)}:${email}`,
  ipLogin: (ip: string) => `login:ip-attempts:${ipBucket(ip)}`,
};

/**
 * IPv4 addresses as they are; IPv6 by /64, since one subscriber is usually given a whole /64.
 * Mobile networks put many customers behind one IPv4 address, so the per-IP limit is generous.
 */
export function ipBucket(ip: string) {
  const address = ip.split("%")[0]!.toLowerCase();
  const v4 = address.match(/^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) return v4[1]!;
  if (!address.includes(":")) return address;

  const [head = "", tail] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

/** What is kept in Redis between sending and verifying: never the code itself. */
type PendingOtp = { provider: string; reference: string };

type AuthServiceDeps = {
  prisma: PrismaClient;
  redis: Redis;
  otp: Pick<OtpRegistry, "sender" | "byName">;
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
  const usePassword = () =>
    new AppError(403, "PASSWORD_LOGIN_REQUIRED", "This account signs in to the dashboard with email and password.");

  /** `ip` is the client address; limits SMS spend from one network across many phone numbers. */
  async function sendOtp(phone: string, ip: string) {
    const existing = await prisma.user.findUnique({ where: { phone }, select: { role: true } });
    if (existing && signsInWithPassword(existing.role)) {
      throw usePassword();
    }

    const otpProvider = await otp.sender();

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

    // Counted only once the phone's own limits pass, so retries during a cooldown cost nothing.
    const counted = await redis.multi().incr(keys.ipSends(ip)).expire(keys.ipSends(ip), 3600, "NX").exec();
    const ipSends = Number(counted?.[0]?.[1]);
    // Nothing was sent, so the customer may retry straight away.
    const release = () => redis.multi().del(keys.cooldown(phone)).decr(keys.sends(phone)).decr(keys.ipSends(ip)).exec();

    if (ipSends > env.OTP_SENDS_PER_IP_PER_HOUR) {
      await release();
      throw new AppError(429, "OTP_IP_LIMIT_REACHED", "Too many OTP requests from this network. Try again later.");
    }

    let pending: PendingOtp;
    try {
      const { reference } = await otpProvider.start(phone);
      pending = { provider: otpProvider.name, reference };
    } catch (error) {
      await release();
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
    if (signsInWithPassword(user.role)) {
      throw usePassword();
    }

    const accessToken = signToken({ sub: user.id, role: user.role });

    return { accessToken, user };
  }

  async function login(email: string, password: string, ip: string) {
    // Counted before checking, so parallel guesses cannot slip past the limit.
    const counted = await redis
      .multi()
      .incr(keys.login(email, ip))
      .expire(keys.login(email, ip), LOGIN_WINDOW_SECONDS, "NX")
      .incr(keys.ipLogin(ip))
      .expire(keys.ipLogin(ip), 3600, "NX")
      .exec();
    const attempts = Number(counted?.[0]?.[1]);
    const ipAttempts = Number(counted?.[2]?.[1]);
    if (attempts > MAX_LOGIN_ATTEMPTS || ipAttempts > MAX_IP_LOGIN_ATTEMPTS_PER_HOUR) {
      throw new AppError(429, "LOGIN_LIMIT_REACHED", "Too many sign-in attempts. Try again in 15 minutes.");
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, phone: true, name: true, email: true, role: true, passwordHash: true },
    });
    const valid =
      user?.passwordHash && signsInWithPassword(user.role)
        ? await verifyPassword(password, user.passwordHash)
        : await verifyAgainstDummy(password);
    if (!user || !valid) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    await redis.multi().del(keys.login(email, ip)).decr(keys.ipLogin(ip)).exec();

    const { passwordHash: _, ...profile } = user;
    return { accessToken: signToken({ sub: user.id, role: user.role }), user: profile };
  }

  return { sendOtp, verifyOtp, login };
}
