import { z } from "zod";

import { emailSchema, phoneSchema } from "../../shared/schemas.js";

export const sendOtpBodySchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpBodySchema = z.object({
  phone: phoneSchema,
  otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

export const loginBodySchema = z.object({
  email: emailSchema,
  // Not the password policy: an old password that no longer meets it must still be checked.
  password: z.string().min(1).max(200),
});
