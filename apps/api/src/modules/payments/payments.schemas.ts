import { z } from "zod";

export const verifyPaymentBodySchema = z.object({
  providerPaymentId: z.string().trim().min(1).max(128),
  signature: z.string().trim().min(1).max(512),
});

export const webhookParamsSchema = z.object({
  provider: z.string().min(1).max(32),
});

export const mockPayBodySchema = z.object({
  providerOrderId: z.string().trim().min(1).max(128),
  outcome: z.enum(["success", "failure"]),
});
