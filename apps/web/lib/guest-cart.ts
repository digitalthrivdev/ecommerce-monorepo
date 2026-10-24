import "server-only";

import { cookies } from "next/headers";

export const GUEST_CART_COOKIE = "guest_cart";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type GuestCartItem = {
  variantId: string;
  quantity: number;
};

export async function readGuestCart(): Promise<GuestCartItem[]> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(GUEST_CART_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (it) => typeof it?.variantId === "string" && typeof it?.quantity === "number" && it.quantity > 0,
      );
    }
  } catch {}
  return [];
}

export async function writeGuestCart(items: GuestCartItem[]): Promise<void> {
  const cookieStore = await cookies();
  if (items.length === 0) {
    cookieStore.delete(GUEST_CART_COOKIE);
    return;
  }
  cookieStore.set(GUEST_CART_COOKIE, JSON.stringify(items), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

export async function clearGuestCart(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(GUEST_CART_COOKIE);
}

export async function addGuestCartItem(variantId: string, quantity: number): Promise<void> {
  const items = await readGuestCart();
  const existing = items.find((it) => it.variantId === variantId);
  if (existing) {
    existing.quantity = Math.min(50, existing.quantity + quantity);
  } else {
    items.push({ variantId, quantity });
  }
  await writeGuestCart(items);
}

export async function updateGuestCartItem(variantId: string, quantity: number): Promise<void> {
  const items = await readGuestCart();
  const idx = items.findIndex((it) => it.variantId === variantId);
  if (idx !== -1) {
    if (quantity <= 0) {
      items.splice(idx, 1);
    } else {
      items[idx]!.quantity = Math.min(50, quantity);
    }
  }
  await writeGuestCart(items);
}

export async function removeGuestCartItem(variantId: string): Promise<void> {
  const items = await readGuestCart();
  const filtered = items.filter((it) => it.variantId !== variantId);
  await writeGuestCart(filtered);
}
