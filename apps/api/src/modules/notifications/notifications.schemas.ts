import { z } from "zod";

import { DevicePlatform } from "../../generated/prisma/client";

const tokenSchema = z.string().trim().min(1).max(255);

export const registerPushTokenBodySchema = z.object({
  /** The device token from the push provider, e.g. an Expo push token. */
  token: tokenSchema,
  platform: z.enum(DevicePlatform),
});

export const unregisterPushTokenBodySchema = z.object({ token: tokenSchema });

export type RegisterPushTokenInput = z.infer<typeof registerPushTokenBodySchema>;
