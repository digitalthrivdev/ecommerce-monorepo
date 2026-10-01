import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { createContext, use, useEffect, useState, type PropsWithChildren } from "react";

import { apiFetch } from "./api";
import type { PublicSettings } from "./types";

const CACHE_KEY = "settings:v1";

type SettingsValue = {
  /** Null only on a first launch whose request failed. */
  settings: PublicSettings | null;
  /** False until the cache has been read and, without a cache, the first request has finished. */
  ready: boolean;
  error: unknown;
  retry: () => void;
};

const SettingsContext = createContext<SettingsValue | null>(null);

export function useSettingsState() {
  const value = use(SettingsContext);
  if (!value) throw new Error("useSettingsState must be used inside <SettingsProvider>");
  return value;
}

/** Settings for screens rendered after startup, where they are always loaded. */
export function useSettings() {
  const { settings } = useSettingsState();
  if (!settings) throw new Error("useSettings was called before the settings loaded");
  return settings;
}

async function readCache() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as PublicSettings) : null;
  } catch {
    return null;
  }
}

/**
 * Branding, theme and pricing from `GET /settings`. The last good copy is cached on the device so
 * the app opens with the right theme straight away, then refreshes in the background.
 */
export function SettingsProvider({ children }: PropsWithChildren) {
  const [cached, setCached] = useState<PublicSettings | null | undefined>(undefined);

  useEffect(() => {
    readCache().then(setCached);
  }, []);

  const query = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<PublicSettings>("/settings"),
    enabled: cached !== undefined,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (query.data) AsyncStorage.setItem(CACHE_KEY, JSON.stringify(query.data)).catch(() => {});
  }, [query.data]);

  const settings = query.data ?? cached ?? null;
  const ready = cached !== undefined && (settings !== null || query.isError);

  return (
    <SettingsContext value={{ settings, ready, error: settings ? null : query.error, retry: () => void query.refetch() }}>
      {children}
    </SettingsContext>
  );
}
