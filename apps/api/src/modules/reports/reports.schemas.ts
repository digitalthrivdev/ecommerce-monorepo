import { z } from "zod";

export const REPORTS = ["daily-sales", "gst-summary", "payments"] as const;
export type Report = (typeof REPORTS)[number];

/** Longest range one export can cover, in days. */
export const MAX_REPORT_DAYS = 366;

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);

const daySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-04-01")
  .refine((day) => !Number.isNaN(dayMs(day)) && new Date(dayMs(day)).toISOString().startsWith(day), "Not a valid date");

export const reportParamsSchema = z.object({ report: z.enum(REPORTS) });

/** Calendar days in the deployment's TIMEZONE, both included. */
export const reportQuerySchema = z
  .object({
    from: daySchema,
    to: daySchema,
    storeId: z.string().trim().min(1).max(64).optional(),
  })
  .refine((query) => query.to >= query.from, { path: ["to"], message: "The end date must be on or after the start date" })
  .refine((query) => (dayMs(query.to) - dayMs(query.from)) / 86_400_000 < MAX_REPORT_DAYS, {
    path: ["to"],
    message: `Choose at most ${MAX_REPORT_DAYS} days`,
  });

export type ReportQuery = z.infer<typeof reportQuerySchema>;
