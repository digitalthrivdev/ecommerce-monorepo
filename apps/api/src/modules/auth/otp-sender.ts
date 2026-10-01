import type { FastifyBaseLogger } from "fastify";

import { env } from "../../config/env.js";

export interface OtpSender {
  send(phone: string, otp: string): Promise<void>;
}

export function createOtpSender(log: FastifyBaseLogger): OtpSender {
  if (env.NODE_ENV === "production") {
    throw new Error("No SMS provider is configured for OTP delivery");
  }

  return {
    async send(phone, otp) {
      log.info({ phone, otp }, "Development OTP (not sent via SMS)");
    },
  };
}
