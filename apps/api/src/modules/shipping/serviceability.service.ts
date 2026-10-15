import type { PrismaClient } from "../../generated/prisma/client";
import { redis } from "../../infrastructure/redis/client.js";
import { getPlatformSettings } from "../settings/settings.service.js";
import { activeShippingProvider } from "./carrier-registry.js";
import { defaultPickupLocation } from "./pickup-locations.service.js";
import { MANUAL_CARRIER } from "./shipping-provider.js";

export type ServiceabilityResult = { serviceable: boolean; codAvailable: boolean; etaDays: number | null };

/** Pincode answers change rarely, so they are cached for a short while. */
const CACHE_SECONDS = 6 * 60 * 60;

/**
 * Whether the active carrier serves a pincode and takes cash on delivery there. The answer comes from
 * the carrier using the default pickup location's pincode, and is cached in Redis. The manual carrier
 * serves every pincode.
 */
export function createServiceabilityService(prisma: PrismaClient) {
  async function check({ pincode, weightGrams = 0, cod = false }: { pincode: string; weightGrams?: number; cod?: boolean }): Promise<ServiceabilityResult> {
    const settings = await getPlatformSettings(prisma);
    const provider = await activeShippingProvider(prisma, settings);
    const pickup = await defaultPickupLocation(prisma);
    const pickupPincode = pickup?.postalCode ?? "";

    // Without a pickup location a real carrier can't be asked; parcels can't be shipped until one is
    // added, so the order is allowed rather than blocked with a confusing error.
    if (!pickupPincode && provider.name !== MANUAL_CARRIER) {
      return { serviceable: true, codAvailable: true, etaDays: null };
    }

    const key = `serviceability:${provider.name}:${pickupPincode}:${pincode}:${weightGrams}:${cod ? 1 : 0}`;
    try {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached) as ServiceabilityResult;
    } catch {
      // A bad cache entry or a Redis blip: ask the carrier.
    }

    const result = await provider.checkServiceability({ pickupPincode, deliveryPincode: pincode, weightGrams, cod });
    try {
      await redis.set(key, JSON.stringify(result), "EX", CACHE_SECONDS);
    } catch {
      // Caching is optional. The answer is still returned.
    }
    return result;
  }

  return { check };
}

export type ServiceabilityService = ReturnType<typeof createServiceabilityService>;
