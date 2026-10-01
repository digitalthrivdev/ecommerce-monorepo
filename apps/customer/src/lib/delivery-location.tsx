import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createContext, use, useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { addressCoordinates, addressLabel, addressSummary, useAddresses } from "./addresses";
import { apiFetch } from "./api";
import { describePlace, getCurrentCoordinates } from "./location";
import { useSession } from "./session";
import type { Address, Coordinates, Serviceability, Store } from "./types";

export type DeliveryLocation = Coordinates & { label: string; summary: string } & ({ kind: "address"; addressId: string } | { kind: "current" });

type DeliveryLocationValue = {
  location: DeliveryLocation | null;
  /** False until the saved choice has been read from the device. */
  ready: boolean;
  serviceability: UseQueryResult<Serviceability>;
  /** The store serving the location, once it is known to be serviceable. */
  store: Store | null;
  selectAddress: (address: Address) => boolean;
  selectCurrent: (coordinates: Coordinates, summary: string) => void;
};

const DeliveryLocationContext = createContext<DeliveryLocationValue | null>(null);

export function useDeliveryLocation() {
  const value = use(DeliveryLocationContext);
  if (!value) throw new Error("useDeliveryLocation must be used inside <DeliveryLocationProvider>");
  return value;
}

function fromAddress(address: Address): DeliveryLocation | null {
  const coordinates = addressCoordinates(address);
  if (!coordinates) return null;
  return { kind: "address", addressId: address.id, label: addressLabel(address), summary: addressSummary(address), ...coordinates };
}

/**
 * Where the customer wants delivery, remembered on the device per account. A chosen saved address
 * is read from the latest address list, so edits are picked up; when it is deleted, or nothing has
 * been chosen yet, the default address is used.
 */
export function DeliveryLocationProvider({ children }: PropsWithChildren) {
  const { user } = useSession();
  const storageKey = `delivery-location:v1:${user?.id ?? "anonymous"}`;
  const [stored, setStored] = useState<{ key: string; choice: DeliveryLocation | null } | null>(null);
  const addresses = useAddresses();

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((raw) => (raw ? (JSON.parse(raw) as DeliveryLocation) : null))
      .catch(() => null)
      .then((choice) => {
        if (!cancelled) setStored({ key: storageKey, choice });
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const save = useCallback(
    (choice: DeliveryLocation) => {
      setStored({ key: storageKey, choice });
      AsyncStorage.setItem(storageKey, JSON.stringify(choice)).catch(() => {});
    },
    [storageKey],
  );

  const choice = stored?.key === storageKey ? stored.choice : null;
  const storageRead = stored?.key === storageKey;
  const addressesSettled = addresses.data !== undefined || addresses.isError;

  const location = useMemo(() => {
    if (!addresses.data || choice?.kind === "current") return choice;
    const chosen = choice?.kind === "address" ? addresses.data.find((address) => address.id === choice.addressId) : undefined;
    const fallback = addresses.data.find((address) => address.isDefault && addressCoordinates(address));
    return (chosen && fromAddress(chosen)) ?? (fallback && fromAddress(fallback)) ?? null;
  }, [choice, addresses.data]);

  const ready = storageRead && (choice !== null || addressesSettled);

  const serviceability = useQuery({
    queryKey: ["serviceability", location?.latitude.toFixed(5), location?.longitude.toFixed(5)],
    queryFn: () => apiFetch<Serviceability>("/stores/serviceability", { query: { latitude: location!.latitude, longitude: location!.longitude } }),
    enabled: location !== null,
    staleTime: 5 * 60_000,
  });

  const selectAddress = useCallback(
    (address: Address) => {
      const next = fromAddress(address);
      if (next) save(next);
      return next !== null;
    },
    [save],
  );

  const selectCurrent = useCallback((coordinates: Coordinates, summary: string) => save({ kind: "current", label: "Current location", summary, ...coordinates }), [save]);

  const store = location && serviceability.data?.serviceable ? serviceability.data.store : null;

  const value = useMemo(
    () => ({ location, ready, serviceability, store, selectAddress, selectCurrent }),
    [location, ready, serviceability, store, selectAddress, selectCurrent],
  );
  return <DeliveryLocationContext value={value}>{children}</DeliveryLocationContext>;
}

/** Finds the phone's position and makes it the delivery location. */
export function useLocateMe() {
  const { selectCurrent } = useDeliveryLocation();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const locate = useCallback(async () => {
    setLocating(true);
    setError(null);
    try {
      const coordinates = await getCurrentCoordinates();
      const place = await describePlace(coordinates);
      selectCurrent(coordinates, place?.summary || "Near your current location");
      return true;
    } catch (caught) {
      setError(caught);
      return false;
    } finally {
      setLocating(false);
    }
  }, [selectCurrent]);

  return { locate, locating, error };
}
