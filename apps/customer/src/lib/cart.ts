import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { Alert } from "react-native";

import { ApiError, apiFetch, errorMessage } from "./api";
import { formatMoney, shortfall } from "./format";
import { formatPhone } from "./phone";
import type { Cart, CartItem, Product, ProductVariant } from "./types";

/** The API's cap per cart line; a variant can have a lower one. */
export const MAX_QUANTITY_PER_ITEM = 50;

export const CART_KEY = ["cart"] as const;
/** Id of a line the server hasn't created yet. */
const PENDING_ID = "pending:";

/** What the cart needs to show a line before the server has created it. */
export type Sellable = { product: Pick<Product, "productId" | "name" | "slug" | "imageUrl">; variant: ProductVariant };

type QuantityChange = { variantId: string; quantity: number; item?: Sellable };

export function useCart<T = Cart>({ select, refetchOnMount }: { select?: (cart: Cart) => T; refetchOnMount?: "always" } = {}) {
  return useQuery({ queryKey: CART_KEY, queryFn: () => apiFetch<Cart>("/cart"), staleTime: 30_000, select, refetchOnMount });
}

/** True while cart changes are still being saved, so totals may be out of date. */
export function useCartUpdating() {
  return useIsMutating({ mutationKey: CART_KEY }) > 0;
}

/** How many of the variant are in the cart. */
export function useCartQuantity(variantId: string) {
  const select = useCallback((cart: Cart) => cart.items.find((item) => item.variantId === variantId)?.quantity ?? 0, [variantId]);
  return useCart({ select }).data ?? 0;
}

/** How many of any of the product's variants are in the cart. */
export function useProductCartQuantity(productId: string) {
  const select = useCallback((cart: Cart) => cart.items.reduce((sum, item) => (item.productId === productId ? sum + item.quantity : sum), 0), [productId]);
  return useCart({ select }).data ?? 0;
}

/** Lines the customer sees; a line set to 0 stays cached until the server confirms the removal. */
export const visibleItems = (cart: Cart) => cart.items.filter((item) => item.quantity > 0);

/** Why the cart can't be ordered yet, or null when checkout can go ahead. */
type BlockerSettings = { currency: string; support: { phone: string | null; email: string | null } };

function contactText({ phone, email }: BlockerSettings["support"]) {
  if (phone) return ` Call us on ${formatPhone(phone)}.`;
  if (email) return ` Email us at ${email}.`;
  return "";
}

export function checkoutBlocker(cart: Cart, { currency, support }: BlockerSettings) {
  if (cart.checkout?.blocked) return `Your account can't place orders right now.${contactText(support)}`;
  if (!cart.isValid) return "Remove or update the items marked in your cart.";
  if (cart.bill && !cart.bill.meetsMinimum) {
    return `Add ${formatMoney(shortfall(cart.bill.minOrderValue, cart.bill.subtotal), currency)} more to reach the ${formatMoney(cart.bill.minOrderValue, currency)} minimum order.`;
  }
  if (cart.checkout && cart.checkout.paymentMethods.length === 0) {
    return cart.checkout.codUnavailable === "LIMIT" && cart.checkout.codMaxOrderValue
      ? `Cash on delivery is available for orders up to ${formatMoney(cart.checkout.codMaxOrderValue, currency)}. Remove some items to order.`
      : `Cash on delivery isn't available for your account.${contactText(support)}`;
  }
  return null;
}

/** Why the cart can't be paid cash on delivery, shown in the payment choice; null when it can. */
export function codUnavailableText(cart: Cart, currency: string) {
  const checkout = cart.checkout;
  if (!checkout || checkout.paymentMethods.includes("COD") || checkout.blocked) return null;
  if (checkout.codUnavailable === "LIMIT" && checkout.codMaxOrderValue) {
    return `Cash on delivery is available for orders up to ${formatMoney(checkout.codMaxOrderValue, currency)}.`;
  }
  return "Cash on delivery isn't available for your account.";
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
    unitPrice: variant.price,
    compareAtPrice: variant.compareAtPrice,
    lineTotal: null,
    issue: null,
  };
}

function previewQuantity(cart: Cart, { variantId, quantity, item }: QuantityChange): Cart {
  const exists = cart.items.some((line) => line.variantId === variantId);
  const items = exists
    ? cart.items.map((line) => (line.variantId === variantId ? withQuantity(line, quantity) : line))
    : item && quantity > 0
      ? [...cart.items, withQuantity(pendingItem(item), quantity)]
      : cart.items;
  const subtotal = items.reduce((sum, line) => (line.issue === null && line.lineTotal ? sum + toPaise(line.lineTotal) : sum), 0);

  return {
    ...cart,
    items,
    itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: fromPaise(subtotal),
  };
}

const emptyCart = (cart: Cart): Cart => ({
  ...cart,
  items: [],
  itemCount: 0,
  subtotal: "0.00",
  bill: null,
  checkout: null,
  isValid: false,
  coupon: null,
});

/** Keeps optimistic quantities but takes line ids from the server, so queued changes target the right lines. */
function syncItemIds(cart: Cart, server: Cart): Cart {
  const ids = new Map(server.items.map((item) => [item.variantId, item.id]));
  return { ...cart, items: cart.items.map((item) => ({ ...item, id: ids.get(item.variantId) ?? PENDING_ID + item.variantId })) };
}

/** Runs after earlier cart changes have been saved, so cached line ids match the server. */
function sendQuantity(queryClient: QueryClient, { variantId, quantity }: QuantityChange) {
  const id = queryClient.getQueryData<Cart>(CART_KEY)?.items.find((item) => item.variantId === variantId)?.id;
  if (id && !id.startsWith(PENDING_ID)) {
    const path = `/cart/items/${encodeURIComponent(id)}`;
    return quantity > 0 ? apiFetch<Cart>(path, { method: "PATCH", body: { quantity } }) : apiFetch<Cart>(path, { method: "DELETE" });
  }
  if (quantity > 0) return apiFetch<Cart>("/cart/items", { method: "POST", body: { variantId, quantity } });
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
    notify("Limited stock", available > 0 ? `Only ${available} left.` : "This item just went out of stock.");
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

/** Applies or removes the cart's coupon. Errors are left to the caller, which shows them next to the code. */
export function useCouponActions() {
  const queryClient = useQueryClient();
  const options = {
    mutationKey: CART_KEY,
    scope: { id: "cart" },
    onSuccess: (server: Cart) =>
      queryClient.setQueryData<Cart>(CART_KEY, (cart) =>
        queryClient.isMutating({ mutationKey: CART_KEY }) === 1 || !cart ? server : { ...cart, coupon: server.coupon },
      ),
  };
  const apply = useMutation({ ...options, mutationFn: (code: string) => apiFetch<Cart>("/cart/coupon", { method: "PUT", body: { code } }) });
  const remove = useMutation({ ...options, mutationFn: () => apiFetch<Cart>("/cart/coupon", { method: "DELETE" }) });
  return { apply, remove };
}

export function useCartActions() {
  const queryClient = useQueryClient();
  const { mutate: update } = useCartMutation((change: QuantityChange) => sendQuantity(queryClient, change), previewQuantity);
  const { mutate: clear } = useCartMutation(() => apiFetch<Cart>("/cart", { method: "DELETE" }), emptyCart);

  /** `item` is needed when the variant isn't in the cart yet. */
  const setQuantity = useCallback(
    (variantId: string, quantity: number, item?: Sellable) => {
      const line = queryClient.getQueryData<Cart>(CART_KEY)?.items.find((candidate) => candidate.variantId === variantId);
      const max = item?.variant.maxOrderQuantity ?? line?.maxQuantity ?? MAX_QUANTITY_PER_ITEM;
      update({ variantId, quantity: Math.min(Math.max(quantity, 0), max), item });
    },
    [queryClient, update],
  );

  const add = useCallback((item: Sellable) => setQuantity(item.variant.variantId, 1, item), [setQuantity]);

  return { add, setQuantity, clear: useCallback(() => clear(undefined), [clear]) };
}
