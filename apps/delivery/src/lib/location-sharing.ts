import * as Location from "expo-location";
import { useEffect, useState } from "react";

import { apiFetch } from "./api";

const IDLE_INTERVAL_MS = 20_000;
const IDLE_MIN_DISTANCE_METERS = 30;
/** Matches the customer app's tracking refresh. Sent even when standing still, so the customer's map keeps the partner while they wait at the store. */
const DELIVERING_INTERVAL_MS = 10_000;

/** Devices report -1 or null for readings they don't have; the API only accepts real values. */
function reading(value: number | null, max: number) {
  return value !== null && value >= 0 && value <= max ? value : undefined;
}

/**
 * Shares the phone's position while `enabled` (the partner is online) and the app is open, more often
 * while `delivering`. Returns whether location permission was granted, or null before it has been asked.
 */
export function useLocationSharing(enabled: boolean, delivering: boolean) {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const interval = delivering ? DELIVERING_INTERVAL_MS : IDLE_INTERVAL_MS;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let lastSent = 0;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      setGranted(status === "granted");
      if (status !== "granted") return;

      const watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: interval, distanceInterval: delivering ? 0 : IDLE_MIN_DISTANCE_METERS },
        ({ coords }) => {
          const now = Date.now();
          // Readings can arrive slightly early; skipping those would halve the rate.
          if (now - lastSent < interval * 0.8) return;
          lastSent = now;
          apiFetch("/delivery/location", {
            method: "POST",
            body: {
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy: reading(coords.accuracy, 10_000),
              heading: reading(coords.heading, 360),
              speed: reading(coords.speed, 100),
            },
          }).catch(() => {});
        },
      );
      if (cancelled) watch.remove();
      else subscription = watch;
    })().catch(() => {
      if (!cancelled) setGranted(false);
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled, delivering]);

  return granted;
}
