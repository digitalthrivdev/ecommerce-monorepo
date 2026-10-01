import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DECIMAL_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

export const idSchema = z.string().trim().min(1).max(64);

export const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`);

/** Empty optional inputs become null so an edit can clear the value. */
export const optionalText = (max: number) => text(max).transform((value) => value || null);

/** Empty means "derive from the name" on create and "keep" on update. */
export const slugInput = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => value === "" || SLUG_PATTERN.test(value), "Use lowercase letters, numbers and single dashes")
  .refine((value) => value.length <= 100, "Keep this under 100 characters");

export const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === "" || URL.canParse(value), "Enter a full URL starting with https://")
  .transform((value) => value || null);

/** Positive money or quantity with up to 2 decimals, as the API expects it (a string). */
export const positiveDecimal = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => DECIMAL_PATTERN.test(value) && Number(value) > 0, message);

export const optionalPositiveDecimal = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || (DECIMAL_PATTERN.test(value) && Number(value) > 0), message)
    .transform((value) => value || null);

/** Money that may be zero, with up to 2 decimals, as the API expects it (a string). */
export const decimal = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => DECIMAL_PATTERN.test(value), message);

export const optionalDecimal = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || DECIMAL_PATTERN.test(value), message)
    .transform((value) => value || null);

export const optionalEmail = z
  .string()
  .trim()
  .pipe(z.union([z.literal("").transform(() => null), z.email("Enter a valid email address").max(200, "Keep this under 200 characters")]));

/** Accepts spaces, dashes and brackets ("+91 98765-43210") and sends E.164 to the API. */
export const phoneInput = z
  .string()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, "Enter the number with country code, e.g. +919876543210"));

export const optionalPhoneInput = z.union([z.literal("").transform(() => null), phoneInput]);

export const formText = (formData: FormData, name: string) => String(formData.get(name) ?? "");
export const formChecked = (formData: FormData, name: string) => formData.get(name) === "on";
