import { z } from "zod";

/** A blank email clears it. */
const emailSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() || null : value),
  z.email("Enter a valid email address").max(200).toLowerCase().nullable(),
);

export const updateProfileBodySchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(100),
    email: emailSchema,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

export type UpdateProfileInput = z.infer<typeof updateProfileBodySchema>;
