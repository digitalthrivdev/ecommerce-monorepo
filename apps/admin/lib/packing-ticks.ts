"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Packing ticks are kept on this device only; they are a packing aid, not order data. */
const key = (orderId: string) => `packed:${orderId}`;
const EVENT = "packing-ticks";
const EMPTY = "[]";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function write(orderId: string, ids: string[]) {
  if (ids.length === 0) {
    localStorage.removeItem(key(orderId));
  } else {
    localStorage.setItem(key(orderId), JSON.stringify(ids));
  }
  window.dispatchEvent(new Event(EVENT));
}

export function clearPackingTicks(orderId: string) {
  if (localStorage.getItem(key(orderId)) !== null) write(orderId, []);
}

/** Ticked item ids for an order, shared by the checklist and the "Packed – ready" button. */
export function usePackingTicks(orderId: string) {
  // The raw string is the snapshot so it stays equal between reads.
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key(orderId)) ?? EMPTY,
    () => EMPTY,
  );
  let ticked: string[];
  try {
    ticked = JSON.parse(raw) as string[];
  } catch {
    ticked = [];
  }

  const toggle = useCallback(
    (itemId: string) => {
      const current: string[] = JSON.parse(localStorage.getItem(key(orderId)) ?? EMPTY);
      write(orderId, current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
    },
    [orderId],
  );

  return { ticked: new Set(ticked), toggle };
}
