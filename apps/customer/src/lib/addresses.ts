import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";
import type { Address, AddressInput, Coordinates } from "./types";

const ADDRESSES_KEY = ["addresses"] as const;

export function useAddresses() {
  return useQuery({
    queryKey: ADDRESSES_KEY,
    queryFn: async () => (await apiFetch<{ items: Address[] }>("/users/me/addresses")).items,
  });
}

/** Creates the address, or updates it when an id is given. */
export function useSaveAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: AddressInput }) =>
      id ? apiFetch<Address>(`/users/me/addresses/${id}`, { method: "PATCH", body: input }) : apiFetch<Address>("/users/me/addresses", { method: "POST", body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADDRESSES_KEY }),
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/users/me/addresses/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADDRESSES_KEY }),
  });
}

export function addressCoordinates(address: Address): Coordinates | null {
  if (address.latitude === null || address.longitude === null) return null;
  return { latitude: Number(address.latitude), longitude: Number(address.longitude) };
}

export const addressLabel = (address: Address) => address.label || "Address";

/** "Flat 4B, MG Road, Bengaluru" */
export function addressSummary(address: Address) {
  return [address.addressLine1, address.addressLine2, address.city].filter(Boolean).join(", ");
}
