import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import { useSession } from "./session";

const MAX_RECENT = 8;

async function read(key: string) {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((term): term is string => typeof term === "string") : [];
  } catch {
    return [];
  }
}

/** Search terms the customer used on this phone, newest first, kept per account. */
export function useRecentSearches() {
  const { user } = useSession();
  const storageKey = `recent-searches:v1:${user?.id ?? "anonymous"}`;
  const [searches, setSearches] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    read(storageKey).then((terms) => {
      if (!cancelled) setSearches(terms);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  /** Reads the stored list again, so it still saves after the screen has closed. */
  const add = useCallback(
    async (term: string) => {
      const trimmed = term.trim();
      if (!trimmed) return;
      const current = await read(storageKey);
      const next = [trimmed, ...current.filter((saved) => saved.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
      setSearches(next);
      await AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    setSearches([]);
    AsyncStorage.removeItem(storageKey).catch(() => {});
  }, [storageKey]);

  return { searches, add, clear };
}
