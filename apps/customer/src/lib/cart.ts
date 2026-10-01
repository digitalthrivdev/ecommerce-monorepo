import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Alert } from "react-native";

import { ApiError, apiFetch, errorMessage } from "./api";
import { useDeliveryLocation } from "./delivery-location";
import { formatMoney, shortfall } from "./format";
import type { Cart, CartItem, Store, StoreProduct } from "./types";

export const MAX_QUANTITY_PER_ITEM = 50;

export const CART_KEY = ["cart"] as const;
/** Id of a line the server hasn't created yet. */
const PENDING_ID = "pending:";

type CartStore = Pick<Store, "id" | "name" | "code">;
type QuantityChange = { productId: string; quantity: number; product?: StoreProduct; store: CartStore | null };

export function useCart<T = Cart>({ select, refetchOnMount }: { select?: (cart: Cart) => T; refetchOnMount?: "always" } = {}) {
  return useQuery({ queryKey: CART_KEY, queryFn: () => apiFetch<Cart>("/cart"), staleTime: 30_000, select, refetchOnMount });
}

/** True while cart changes are still being saved, so totals may be out of date. */
export function useCartUpdating() {
  return useIsMutating({ mutationKey: CART_KEY }) > 0;
}

/** How many of the product are in the cart for the current store. */
export function useCartQuantity(productId: string) {
  const storeId = useDeliveryLocation().store?.id;
  const select = useCallback(
    (cart: Cart) => (cart.store?.id === storeId ? (cart.items.find((item) => item.productId === productId)?.quantity ?? 0) : 0),
    [productId, storeId],
  );
  return useCart({ select }).data ?? 0;
}

/** Lines the customer sees; a line set to 0 stays cached until the server confirms the removal. */
export const visibleItems = (cart: Cart) => cart.items.filter((item) => item.quantity > 0);

/** Why the cart can't be ordered yet, or null when checkout can go ahead. */
export function checkoutBlocker(cart: Cart, storeId: string | undefined, currency: string) {
  if (!storeId) return "Choose a delivery location to check out.";
  if (cart.store?.id !== storeId) return "Your cart is from a store that doesn't deliver to this location.";
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
  const fitsStock = item.issue === "INSUFFICIENT_STOCK" && quantity <= (item.availableQuantity ?? 0);
  return {
    ...item,
    quantity,
    lineTotal: item.unitPrice && fromPaise(toPaise(item.unitPrice) * quantity),
    issue: fitsStock ? null : item.issue,
  };
}

function pendingItem(product: StoreProduct): CartItem {
  return {
    id: PENDING_ID + product.productId,
    productId: product.productId,
    name: product.name,
    slug: product.slug,
    imageUrl: product.imageUrl,
    unit: product.unit,
    packQuantity: product.quantity,
    quantity: 0,
    unitPrice: product.sellingPrice,
    mrp: product.mrp,
    lineTotal: null,
    issue: null,
  };
}

function previewQuantity(cart: Cart, { productId, quantity, product, store }: QuantityChange): Cart {
  const exists = cart.items.some((item) => item.productId === productId);
  const items = exists
    ? cart.items.map((item) => (item.productId === productId ? withQuantity(item, quantity) : item))
    : product && quantity > 0
      ? [...cart.items, withQuantity(pendingItem(product), quantity)]
      : cart.items;
  const hadItems = cart.items.some((item) => item.quantity > 0);
  const subtotal = items.reduce((sum, item) => (item.issue === null && item.lineTotal ? sum + toPaise(item.lineTotal) : sum), 0);

  return {
    ...cart,
    store: hadItems || !store ? cart.store : { ...store, status: "ACTIVE" },
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: fromPaise(subtotal),
  };
}

const emptyCart = (cart: Cart): Cart => ({ ...cart, store: null, items: [], itemCount: 0, subtotal: "0.00", bill: null, isValid: false });

/** Keeps optimistic quantities but takes line ids from the server, so queued changes target the right lines. */
function syncItemIds(cart: Cart, server: Cart): Cart {
  const ids = new Map(server.items.map((item) => [item.productId, item.id]));
  return { ...cart, items: cart.items.map((item) => ({ ...item, id: ids.get(item.productId) ?? PENDING_ID + item.productId })) };
}

/** Runs after earlier cart changes have been saved, so cached line ids match the server. */
function sendQuantity(queryClient: QueryClient, { productId, quantity, store }: QuantityChange) {
  const id = queryClient.getQueryData<Cart>(CART_KEY)?.items.find((item) => item.productId === productId)?.id;
  if (id && !id.startsWith(PENDING_ID)) {
    const path = `/cart/items/${encodeURIComponent(id)}`;
    return quantity > 0 ? apiFetch<Cart>(path, { method: "PATCH", body: { quantity } }) : apiFetch<Cart>(path, { method: "DELETE" });
  }
  if (quantity > 0 && store) return apiFetch<Cart>("/cart/items", { method: "POST", body: { storeId: store.id, productId, quantity } });
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

  const setQuantity = useCallback(
    (productId: string, quantity: number, product?: StoreProduct) =>
      update({ productId, quantity: Math.min(Math.max(quantity, 0), MAX_QUANTITY_PER_ITEM), product, store }),
    [update, store],
  );

  /** Adds one, first offering to clear a cart that holds another store's items. */
  const add = useCallback(
    (product: StoreProduct) => {
      if (!store) return;
      const cart = queryClient.getQueryData<Cart>(CART_KEY);
      const otherStore = cart?.store && cart.store.id !== store.id && visibleItems(cart).length > 0 ? cart.store : null;
      if (!otherStore) {
        setQuantity(product.productId, 1, product);
        return;
      }
      Alert.alert("Replace cart items?", `Your cart has items from ${otherStore.name}. Clear it to shop from ${store.name}?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear cart",
          style: "destructive",
          onPress: () => {
            clear(undefined);
            setQuantity(product.productId, 1, product);
          },
        },
      ]);
    },
    [queryClient, store, setQuantity, clear],
  );

  return { add, setQuantity, clear: useCallback(() => clear(undefined), [clear]) };
}
