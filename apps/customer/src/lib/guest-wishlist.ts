import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiFetch } from "./api";

const GUEST_WISHLIST_STORAGE_KEY = "guest_wishlist_ids";

export async function readGuestWishlist(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(GUEST_WISHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeGuestWishlist(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(GUEST_WISHLIST_STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

export async function clearGuestWishlist(): Promise<void> {
  try {
    await AsyncStorage.removeItem(GUEST_WISHLIST_STORAGE_KEY);
  } catch {}
}

export async function syncGuestWishlist(): Promise<void> {
  try {
    const ids = await readGuestWishlist();
    if (!ids.length) return;
    for (const id of ids) {
      try {
        await apiFetch<{ productId: string; saved: boolean }>(`/wishlist/${encodeURIComponent(id)}`, { method: "PUT" });
      } catch {}
    }
    await clearGuestWishlist();
  } catch {}
}
