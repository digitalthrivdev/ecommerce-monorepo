import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";

import { AppError } from "../../shared/errors.js";
import { OTP_LENGTH, type OtpCheck, type OtpProvider } from "./otp-provider.js";

const API = "https://cpaas.messagecentral.com";
/** Used when the token does not say when it expires. */
const DEFAULT_TOKEN_TTL_SECONDS = 3600;

type Response = { status: number; body: Record<string, unknown> | null };

// VerifyNow response codes (responseCode in the body).
const CODES = {
  SUCCESS: 200,
  INVALID_VERIFICATION_ID: 505,
  REQUEST_ALREADY_EXISTS: 506,
  INVALID_COUNTRY_CODE: 511,
  VERIFICATION_FAILED: 700,
  WRONG_OTP_PROVIDED: 702,
  ALREADY_VERIFIED: 703,
  VERIFICATION_EXPIRED: 705,
  MAXIMUM_LIMIT_REACHED: 800,
} as const;

class OtpServiceError extends AppError {
  constructor() {
    super(502, "OTP_SERVICE_UNAVAILABLE", "We couldn't send the OTP right now. Please try again.");
  }
}

const maskPhone = (phone: string) => `${phone.slice(0, -4).replace(/\d/g, "*")}${phone.slice(-4)}`;

/** Seconds until a JWT expires, or null when it is not a JWT with an `exp` claim. */
function jwtSecondsLeft(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString()) as { exp?: unknown };
    return typeof payload.exp === "number" ? Math.floor(payload.exp - Date.now() / 1000) : null;
  } catch {
    return null;
  }
}

function responseCode(response: Response) {
  const data = response.body?.data as Record<string, unknown> | undefined;
  const code = Number(response.body?.responseCode ?? data?.responseCode ?? response.status);
  return Number.isFinite(code) ? code : response.status;
}

/**
 * Message Central VerifyNow: Message Central generates the SMS code and checks it; this API only
 * keeps the verification id. https://www.messagecentral.com
 */
export function createMessageCentralProvider(config: {
  customerId: string;
  /** Base64-encoded account password. */
  key: string;
  countryCode: string;
  email: string | undefined;
  log: FastifyBaseLogger;
  redis: Redis;
}): OtpProvider {
  const { log, redis } = config;
  const tokenKey = `otp:message-central:token:${config.customerId}`;

  async function request(method: "GET" | "POST", path: string, params: Record<string, string>, authToken?: string): Promise<Response> {
    const url = `${API}${path}?${new URLSearchParams(params)}`;
    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        method,
        headers: { accept: "application/json", ...(authToken && { authToken }) },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      log.error({ path, err: String(error) }, "Message Central request failed");
      throw new OtpServiceError();
    }
    const text = await response.text();
    let body: Record<string, unknown> | null = null;
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    return { status: response.status, body };
  }

  async function authToken(refresh = false) {
    if (!refresh) {
      const cached = await redis.get(tokenKey);
      if (cached) return cached;
    }

    const response = await request("GET", "/auth/v1/authentication/token", {
      customerId: config.customerId,
      key: config.key,
      scope: "NEW",
      country: config.countryCode,
      ...(config.email && { email: config.email }),
    });
    const data = response.body?.data as Record<string, unknown> | undefined;
    const token = response.body?.token ?? data?.token ?? data?.authToken;
    // Failures come back as HTTP 200 with e.g. {"status":400,"error":"customerId is invalid"}.
    if (response.status !== 200 || typeof token !== "string" || !token) {
      log.error(
        { httpStatus: response.status, status: response.body?.status, error: response.body?.error },
        "Message Central rejected the account credentials",
      );
      throw new OtpServiceError();
    }

    const secondsLeft = jwtSecondsLeft(token);
    const ttl = secondsLeft === null ? DEFAULT_TOKEN_TTL_SECONDS : secondsLeft - 300;
    if (ttl > 0) await redis.set(tokenKey, token, "EX", ttl);
    return token;
  }

  /** Calls with the cached token and retries once with a fresh one if it was rejected. */
  async function authorized(method: "GET" | "POST", path: string, params: Record<string, string>) {
    let response = await request(method, path, params, await authToken());
    if (response.status === 401 || response.status === 403) {
      response = await request(method, path, params, await authToken(true));
    }
    return response;
  }

  function nationalNumber(phone: string) {
    const prefix = `+${config.countryCode}`;
    if (!phone.startsWith(prefix)) {
      throw new AppError(400, "PHONE_COUNTRY_NOT_SUPPORTED", `Only ${prefix} phone numbers can sign in`);
    }
    return phone.slice(prefix.length);
  }

  return {
    name: "message-central",

    async start(phone) {
      const mobileNumber = nationalNumber(phone);
      const startedAt = Date.now();
      const response = await authorized("POST", "/verification/v3/send", {
        customerId: config.customerId,
        countryCode: config.countryCode,
        mobileNumber,
        flowType: "SMS",
        otpLength: String(OTP_LENGTH),
      });
      const code = responseCode(response);
      const verificationId = (response.body?.data as Record<string, unknown> | undefined)?.verificationId;
      log.info({ phone: maskPhone(phone), responseCode: code, verificationId, durationMs: Date.now() - startedAt }, "Message Central OTP send");

      if (code === CODES.SUCCESS && (typeof verificationId === "string" || typeof verificationId === "number")) {
        return { reference: String(verificationId) };
      }
      if (code === CODES.REQUEST_ALREADY_EXISTS) {
        throw new AppError(429, "OTP_COOLDOWN", "An OTP was sent recently. Please wait a minute and try again.");
      }
      if (code === CODES.MAXIMUM_LIMIT_REACHED) {
        throw new AppError(429, "OTP_LIMIT_REACHED", "Too many OTP requests. Try again later.");
      }
      if (code === CODES.INVALID_COUNTRY_CODE) {
        throw new AppError(400, "PHONE_COUNTRY_NOT_SUPPORTED", "This phone number cannot receive an OTP");
      }
      throw new OtpServiceError();
    },

    async check({ code, reference }): Promise<OtpCheck> {
      const params = { customerId: config.customerId, verificationId: reference, code, flowType: "SMS" };
      let response = await authorized("GET", "/verification/v3/validateOtp", params);
      // The endpoint has been documented as both GET and POST.
      if (response.status === 405) {
        response = await authorized("POST", "/verification/v3/validateOtp", params);
      }

      const result = responseCode(response);
      const status = (response.body?.data as Record<string, unknown> | undefined)?.verificationStatus;
      log.info({ verificationId: reference, responseCode: result, verificationStatus: status }, "Message Central OTP check");

      if (result === CODES.SUCCESS && status === "VERIFICATION_COMPLETED") return "valid";
      switch (result) {
        case CODES.WRONG_OTP_PROVIDED:
        case CODES.VERIFICATION_FAILED:
          return "invalid";
        case CODES.VERIFICATION_EXPIRED:
        case CODES.INVALID_VERIFICATION_ID:
        case CODES.ALREADY_VERIFIED:
          return "expired";
        case CODES.MAXIMUM_LIMIT_REACHED:
          return "too-many-attempts";
        default:
          throw new OtpServiceError();
      }
    },

    async checkCredentials() {
      try {
        await authToken(true);
        return true;
      } catch {
        return false;
      }
    },
  };
}
