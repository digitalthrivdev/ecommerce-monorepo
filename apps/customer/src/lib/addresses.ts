import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { apiFetch } from "./api";
import { useSession } from "./session";
import type { Address, AddressInput } from "./types";

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

/**
 * The saved address orders go to, remembered on the device per account. Falls back to the default
 * address when nothing has been chosen yet or the chosen one was deleted.
 */
export function useDeliveryAddress() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const storageKey = `delivery-address:v1:${user?.id ?? "anonymous"}`;
  const queryKey = ["delivery-address", storageKey];
  const addresses = useAddresses();
  const chosenId = useQuery({
    queryKey,
    queryFn: () => AsyncStorage.getItem(storageKey).catch(() => null),
    staleTime: Infinity,
  }).data;

  const address = addresses.data?.find((saved) => saved.id === chosenId) ?? addresses.data?.find((saved) => saved.isDefault);

  const select = useCallback(
    (selected: Address) => {
      queryClient.setQueryData(["delivery-address", storageKey], selected.id);
      AsyncStorage.setItem(storageKey, selected.id).catch(() => {});
    },
    [queryClient, storageKey],
  );

  return { address, addresses, select };
}

export const addressLabel = (address: Address) => address.label || "Address";

/** "Flat 4B, MG Road, Bengaluru" */
export function addressSummary(address: Address) {
  return [address.addressLine1, address.addressLine2, address.city].filter(Boolean).join(", ");
}
