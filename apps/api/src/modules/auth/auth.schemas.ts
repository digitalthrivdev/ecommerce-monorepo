import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format, e.g. +919876543210");

export const sendOtpBodySchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpBodySchema = z.object({
  phone: phoneSchema,
  otp: z.string().trim().regex(/^\d{6}$/, "OTP must be 6 digits"),
});
