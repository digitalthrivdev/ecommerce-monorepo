import * as Location from "expo-location";

import type { Coordinates } from "./types";

const FIX_TIMEOUT_MS = 15_000;

export class LocationError extends Error {
  constructor(
    readonly reason: "denied" | "disabled" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "LocationError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Asks for permission if needed, then returns the phone's position (or its last known one if a fresh fix is slow). */
export async function getCurrentCoordinates(): Promise<Coordinates> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new LocationError("denied", "Location access is off. Allow it in settings, or add your address instead.");
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new LocationError("disabled", "Turn on location on your phone and try again.");
  }

  try {
    const fix = (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), FIX_TIMEOUT_MS)) ?? (await Location.getLastKnownPositionAsync());
    if (fix) return { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
  } catch {
    // Reported below.
  }
  throw new LocationError("unavailable", "We couldn't find your location. Try again, or add your address instead.");
}

export type PlaceDetails = { area: string | null; city: string | null; state: string | null; postalCode: string | null; summary: string };

/** Street, city and postcode for a point from the phone's geocoder; null when it has no answer. */
export async function describePlace(coordinates: Coordinates): Promise<PlaceDetails | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync(coordinates);
    if (!place) return null;
    const area = [place.street, place.district].filter(Boolean).join(", ") || place.name || null;
    const city = place.city ?? place.subregion ?? null;
    const summary = [place.district ?? place.street ?? place.name, city].filter(Boolean).join(", ") || place.formattedAddress || "";
    return { area, city, state: place.region, postalCode: place.postalCode, summary };
  } catch {
    return null;
  }
}
