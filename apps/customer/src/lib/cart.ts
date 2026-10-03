import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Alert } from "react-native";

import { ApiError, apiFetch, errorMessage } from "./api";
import { useDeliveryLocation } from "./delivery-location";
import { formatMoney, shortfall } from "./format";
import { closedText } from "./store-hours";
import type { Cart, CartItem, Store, StoreProduct, StoreVariant } from "./types";

/** The API's cap per cart line; a variant can have a lower one. */
export const MAX_QUANTITY_PER_ITEM = 50;

export const CART_KEY = ["cart"] as const;
/** Id of a line the server hasn't created yet. */
const PENDING_ID = "pending:";

/** What the cart needs to show a line before the server has created it. */
export type Sellable = { product: Pick<StoreProduct, "productId" | "name" | "slug" | "imageUrl">; variant: StoreVariant };

type CartStore = Pick<Store, "id" | "name" | "code" | "isOpen">;
type QuantityChange = { variantId: string; quantity: number; item?: Sellable; store: CartStore | null };

export function useCart<T = Cart>({ select, refetchOnMount }: { select?: (cart: Cart) => T; refetchOnMount?: "always" } = {}) {
  return useQuery({ queryKey: CART_KEY, queryFn: () => apiFetch<Cart>("/cart"), staleTime: 30_000, select, refetchOnMount });
}

/** True while cart changes are still being saved, so totals may be out of date. */
export function useCartUpdating() {
  return useIsMutating({ mutationKey: CART_KEY }) > 0;
}

function useCurrentStoreCart<T>(pick: (items: CartItem[]) => T, fallback: T) {
  const storeId = useDeliveryLocation().store?.id;
  const select = useCallback((cart: Cart) => (cart.store?.id === storeId ? pick(cart.items) : fallback), [pick, fallback, storeId]);
  return useCart({ select }).data ?? fallback;
}

/** How many of the variant are in the cart for the current store. */
export function useCartQuantity(variantId: string) {
  const pick = useCallback((items: CartItem[]) => items.find((item) => item.variantId === variantId)?.quantity ?? 0, [variantId]);
  return useCurrentStoreCart(pick, 0);
}

/** How many of any of the product's variants are in the cart for the current store. */
export function useProductCartQuantity(productId: string) {
  const pick = useCallback((items: CartItem[]) => items.reduce((sum, item) => (item.productId === productId ? sum + item.quantity : sum), 0), [productId]);
  return useCurrentStoreCart(pick, 0);
}

/** Lines the customer sees; a line set to 0 stays cached until the server confirms the removal. */
export const visibleItems = (cart: Cart) => cart.items.filter((item) => item.quantity > 0);

/** Why the cart can't be ordered yet, or null when checkout can go ahead. */
export function checkoutBlocker(cart: Cart, store: Store | null, { currency, timezone }: { currency: string; timezone: string }) {
  if (!store) return "Choose a delivery location to check out.";
  if (cart.store?.id !== store.id) return "Your cart is from a store that doesn't deliver to this location.";
  if (!cart.storeIsOpen) return closedText(store, timezone);
  if (!cart.isValid) return "Remove or update the items marked in your cart.";
  if (cart.bill && !cart.bill.meetsMinimum) {
    return `Add ${formatMoney(shortfall(cart.bill.minOrderValue, cart.bill.subtotal), currency)} more to reach the ${formatMoney(cart.bill.minOrderValue, currency)} minimum order.`;
  }
  return null;
}

// Paise keep the optimistic preview free of float rounding; the server's totals replace it.
const toPaise = (amount: string) => Math.round(Number(amount) * 100);
const fromPaise = (paise: number) => (paise / 100).toFixed(2);

function withQuantity(item: CartItem, quantity: number): CartItem {
  const fits =
    (item.issue === "INSUFFICIENT_STOCK" && quantity <= (item.availableQuantity ?? 0)) || (item.issue === "QUANTITY_LIMIT" && quantity <= item.maxQuantity);
  return {
    ...item,
    quantity,
    lineTotal: item.unitPrice && fromPaise(toPaise(item.unitPrice) * quantity),
    issue: fits ? null : item.issue,
  };
}

function pendingItem({ product, variant }: Sellable): CartItem {
  return {
    id: PENDING_ID + variant.variantId,
    productId: product.productId,
    variantId: variant.variantId,
    name: product.name,
    variantLabel: variant.label,
    slug: product.slug,
    imageUrl: variant.imageUrl ?? product.imageUrl,
    unit: variant.unit,
    packQuantity: variant.quantity,
    quantity: 0,
    maxQuantity: variant.maxOrderQuantity,
    unitPrice: variant.sellingPrice,
    mrp: variant.mrp,
    lineTotal: null,
    issue: null,
  };
}

function previewQuantity(cart: Cart, { variantId, quantity, item, store }: QuantityChange): Cart {
  const exists = cart.items.some((line) => line.variantId === variantId);
  const items = exists
    ? cart.items.map((line) => (line.variantId === variantId ? withQuantity(line, quantity) : line))
    : item && quantity > 0
      ? [...cart.items, withQuantity(pendingItem(item), quantity)]
      : cart.items;
  const hadItems = cart.items.some((line) => line.quantity > 0);
  const subtotal = items.reduce((sum, line) => (line.issue === null && line.lineTotal ? sum + toPaise(line.lineTotal) : sum), 0);
  const newStore = !hadItems && store;

  return {
    ...cart,
    store: newStore ? { id: store.id, name: store.name, code: store.code, status: "ACTIVE" } : cart.store,
    storeIsOpen: newStore ? store.isOpen : cart.storeIsOpen,
    items,
    itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: fromPaise(subtotal),
  };
}

const emptyCart = (cart: Cart): Cart => ({ ...cart, store: null, storeIsOpen: false, items: [], itemCount: 0, subtotal: "0.00", bill: null, isValid: false });

/** Keeps optimistic quantities but takes line ids from the server, so queued changes target the right lines. */
function syncItemIds(cart: Cart, server: Cart): Cart {
  const ids = new Map(server.items.map((item) => [item.variantId, item.id]));
  return { ...cart, items: cart.items.map((item) => ({ ...item, id: ids.get(item.variantId) ?? PENDING_ID + item.variantId })) };
}

/** Runs after earlier cart changes have been saved, so cached line ids match the server. */
function sendQuantity(queryClient: QueryClient, { variantId, quantity, store }: QuantityChange) {
  const id = queryClient.getQueryData<Cart>(CART_KEY)?.items.find((item) => item.variantId === variantId)?.id;
  if (id && !id.startsWith(PENDING_ID)) {
    const path = `/cart/items/${encodeURIComponent(id)}`;
    return quantity > 0 ? apiFetch<Cart>(path, { method: "PATCH", body: { quantity } }) : apiFetch<Cart>(path, { method: "DELETE" });
  }
  if (quantity > 0 && store) return apiFetch<Cart>("/cart/items", { method: "POST", body: { storeId: store.id, variantId, quantity } });
  return apiFetch<Cart>("/cart");
}

let alertOpen = false;

function notify(title: string, message: string) {
  if (alertOpen) return;
  alertOpen = true;
  const close = () => {
    alertOpen = false;
  };
  Alert.alert(title, message, [{ text: "OK", onPress: close }], { onDismiss: close });
}

function showCartError(error: unknown) {
  if (error instanceof ApiError && error.code === "INSUFFICIENT_STOCK") {
    const available = (error.details as { available?: number } | undefined)?.available ?? 0;
    notify("Limited stock", available > 0 ? `Only ${available} left at this store.` : "This item just went out of stock.");
    return;
  }
  if (error instanceof ApiError && error.code === "QUANTITY_LIMIT") {
    const max = (error.details as { maxQuantity?: number } | undefined)?.maxQuantity;
    notify("Limit reached", max ? `You can order at most ${max} of this item.` : error.message);
    return;
  }
  notify("Couldn't update cart", errorMessage(error));
}

/** Cart changes apply on screen immediately and are saved one at a time, in order. */
function useCartMutation<T>(mutationFn: (variables: T) => Promise<Cart>, preview: (cart: Cart, variables: T) => Cart) {
  const queryClient = useQueryClient();
  const isLast = () => queryClient.isMutating({ mutationKey: CART_KEY }) === 1;

  return useMutation({
    mutationKey: CART_KEY,
    scope: { id: "cart" },
    mutationFn,
    onMutate: async (variables: T) => {
      await queryClient.cancelQueries({ queryKey: CART_KEY });
      queryClient.setQueryData<Cart>(CART_KEY, (cart) => cart && preview(cart, variables));
    },
    onSuccess: (server) => queryClient.setQueryData<Cart>(CART_KEY, (cart) => (isLast() || !cart ? server : syncItemIds(cart, server))),
    onError: (error) => {
      showCartError(error);
      if (isLast()) queryClient.invalidateQueries({ queryKey: CART_KEY });
    },
  });
}

export function useCartActions() {
  const queryClient = useQueryClient();
  const { store } = useDeliveryLocation();
  const { mutate: update } = useCartMutation((change: QuantityChange) => sendQuantity(queryClient, change), previewQuantity);
  const { mutate: clear } = useCartMutation(() => apiFetch<Cart>("/cart", { method: "DELETE" }), emptyCart);

  /** `item` is needed when the variant isn't in the cart yet. */
  const setQuantity = useCallback(
    (variantId: string, quantity: number, item?: Sellable) => {
      const line = queryClient.getQueryData<Cart>(CART_KEY)?.items.find((candidate) => candidate.variantId === variantId);
      const max = item?.variant.maxOrderQuantity ?? line?.maxQuantity ?? MAX_QUANTITY_PER_ITEM;
      update({ variantId, quantity: Math.min(Math.max(quantity, 0), max), item, store });
    },
    [queryClient, update, store],
  );

  /** Adds one, first offering to clear a cart that holds another store's items. */
  const add = useCallback(
    (item: Sellable) => {
      if (!store) return;
      const cart = queryClient.getQueryData<Cart>(CART_KEY);
      const otherStore = cart?.store && cart.store.id !== store.id && visibleItems(cart).length > 0 ? cart.store : null;
      if (!otherStore) {
        setQuantity(item.variant.variantId, 1, item);
        return;
      }
      Alert.alert("Replace cart items?", `Your cart has items from ${otherStore.name}. Clear it to shop from ${store.name}?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear cart",
          style: "destructive",
          onPress: () => {
            clear(undefined);
            setQuantity(item.variant.variantId, 1, item);
          },
        },
      ]);
    },
    [queryClient, store, setQuantity, clear],
  );

  return { add, setQuantity, clear: useCallback(() => clear(undefined), [clear]) };
}
