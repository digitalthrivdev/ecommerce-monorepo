import * as Location from "expo-location";
import { useEffect, useState } from "react";

import { apiFetch } from "./api";

const SEND_INTERVAL_MS = 20_000;
const MIN_DISTANCE_METERS = 30;

/** Devices report -1 or null for readings they don't have; the API only accepts real values. */
function reading(value: number | null, max: number) {
  return value !== null && value >= 0 && value <= max ? value : undefined;
}

/**
 * Shares the phone's position while `enabled` (the partner is online) and the app is open.
 * Returns whether location permission was granted, or null before it has been asked.
 */
export function useLocationSharing(enabled: boolean) {
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let lastSent = 0;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      setGranted(status === "granted");
      if (status !== "granted") return;

      const watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: SEND_INTERVAL_MS, distanceInterval: MIN_DISTANCE_METERS },
        ({ coords }) => {
          const now = Date.now();
          if (now - lastSent < SEND_INTERVAL_MS) return;
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
  }, [enabled]);

  return granted;
}
