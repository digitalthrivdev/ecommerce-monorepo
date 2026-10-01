import { z } from "zod";

import { phoneSchema } from "../../shared/schemas.js";

export const sendOtpBodySchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpBodySchema = z.object({
  phone: phoneSchema,
  otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits"),
});
