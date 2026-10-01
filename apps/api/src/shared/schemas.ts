import { z } from "zod";

import { Prisma } from "../generated/prisma/client";

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Phone must be in E.164 format, e.g. +919876543210");

export const idParamsSchema = z.object({
  id: z.string().trim().min(1).max(64),
});

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const booleanQuery = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, digits and single dashes")
  .max(100);

const DECIMAL_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

export const decimalSchema = z
  .string()
  .trim()
  .regex(DECIMAL_PATTERN, 'Must be a decimal string with up to 2 decimal places, e.g. "68.00"');

export const positiveDecimalSchema = decimalSchema.refine(
  (value) => !DECIMAL_PATTERN.test(value) || new Prisma.Decimal(value).gt(0),
  "Must be greater than 0",
);

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}
