import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "./api";

export type Serviceability = { pincode: string; serviceable: boolean; codAvailable: boolean; etaDays: number | null };

export function useServiceability(pincode: string, weightGrams = 0, cod = true) {
  const normalized = pincode.trim();
  return useQuery({
    queryKey: ["serviceability", normalized, weightGrams, cod],
    queryFn: () => apiFetch<Serviceability>("/serviceability", { query: { pincode: normalized, weightGrams, cod } }),
    enabled: /^\d{6}$/.test(normalized),
    staleTime: 5 * 60_000,
  });
}
