import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import {
  Banknote,
  ChevronRight,
  ChevronUp,
  CreditCard,
  House,
  Info,
  ShoppingBag,
  TicketPercent,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { QuantityStepper } from "@/components/add-to-cart";
import { BillDetails, compareAtTotal } from "@/components/bill-details";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { addressLabel, addressSummary, useDeliveryAddress } from "@/lib/addresses";
import { ApiError, errorMessage } from "@/lib/api";
import { ProductRow } from "@/components/product-row";
import { useServiceability } from "@/lib/serviceability";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { CART_KEY, checkoutBlocker, codUnavailableText, useCart, useCartActions, useCartUpdating, useCouponActions, visibleItems } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { smallImage } from "@/lib/images";
import { openProduct } from "@/lib/navigation";
import { usePlaceOrder } from "@/lib/orders";
import { useAlsoBought } from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import type { Cart, CartCoupon, CartItem, OrderDetail, PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

const CART_CHANGED_ERRORS = ["CART_EMPTY", "CART_INVALID", "INSUFFICIENT_STOCK", "QUANTITY_LIMIT", "MIN_ORDER_NOT_MET"];

type CartProblem = { name?: string; variantLabel?: string; available?: number; maxQuantity?: number };

function cartChangeMessage(error: ApiError) {
  if (!Array.isArray(error.details)) return error.message;
  const lines = (error.details as CartProblem[]).map((item) => {
    const name = item.variantLabel ? `${item.name} (${item.variantLabel})` : item.name;
    if (item.maxQuantity !== undefined) return `${name}: at most ${item.maxQuantity} per order`;
    return item.available === undefined ? `${name}: no longer available` : `${name}: only ${item.available} left`;
  });
  return `${error.message}\n\n${lines.join("\n")}`;
}

function showOrderError(error: unknown) {
  if (error instanceof ApiError && CART_CHANGED_ERRORS.includes(error.code)) {
    Alert.alert("Your cart has changed", cartChangeMessage(error));
    return;
  }
  if (error instanceof ApiError && error.code.startsWith("COUPON_")) {
    Alert.alert("Coupon can't be used", `${error.message}. Remove it to order without the discount.`);
    return;
  }
  Alert.alert("Couldn't place your order", errorMessage(error));
}

const PAYMENT_TEXT: Record<PaymentMethod, { icon: LucideIcon; title: string }> = {
  COD: { icon: Banknote, title: "Cash on delivery" },
  ONLINE: { icon: CreditCard, title: "Pay online" },
};

function CartLine({ item, currency }: { item: CartItem; currency: string }) {
  const { setQuantity } = useCartActions();
  const [failed, setFailed] = useState(false);
  const blockedText = item.issue === "UNAVAILABLE" ? "No longer available" : item.issue === "OUT_OF_STOCK" ? "Out of stock" : null;
  const blocked = blockedText !== null;
  const fix =
    item.issue === "INSUFFICIENT_STOCK"
      ? { text: `Only ${item.availableQuantity} left`, quantity: item.availableQuantity ?? 0 }
      : item.issue === "QUANTITY_LIMIT"
        ? { text: `Max ${item.maxQuantity} per order`, quantity: item.maxQuantity }
        : null;
  const lineCompareAt = item.compareAtPrice && item.compareAtPrice !== item.unitPrice ? compareAtTotal([item]) : null;

  return (
    <View className="flex-row gap-3 py-3">
      <Pressable
        onPress={() => openProduct(item.productId, item.variantId)}
        className="size-16 items-center justify-center overflow-hidden rounded-md bg-tile active:opacity-80"
      >
        <View className={cn("size-full items-center justify-center", blocked && "opacity-40")}>
          {item.imageUrl && !failed ? (
            <Image source={{ uri: smallImage(item.imageUrl) }} style={{ width: "86%", height: "86%" }} contentFit="contain" onError={() => setFailed(true)} />
          ) : (
            <Text className="text-xl font-extrabold text-primary">{item.name.charAt(0)}</Text>
          )}
        </View>
      </Pressable>

      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-semibold leading-tight" numberOfLines={2}>
          {item.name}
        </Text>
        {item.variantLabel ? <Text className="text-xs text-muted-foreground">{item.variantLabel}</Text> : null}
        {blockedText && <Text className="text-xs font-semibold text-destructive">{blockedText}</Text>}
        {fix && (
          <View className="flex-row flex-wrap items-center gap-x-2">
            <Text className="text-xs font-semibold text-destructive">{fix.text}</Text>
            <Pressable onPress={() => setQuantity(item.variantId, fix.quantity)} hitSlop={6}>
              <Text className="text-xs font-bold text-primary">Update to {fix.quantity}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View className="items-end gap-1.5">
        {blocked ? (
          <Button variant="outline" size="sm" onPress={() => setQuantity(item.variantId, 0)} className="h-8 rounded-md">
            <Text className="text-xs font-bold">Remove</Text>
          </Button>
        ) : (
          <QuantityStepper quantity={item.quantity} max={item.maxQuantity} onChange={(next) => setQuantity(item.variantId, next)} />
        )}
        {item.lineTotal && !blocked && (
          <View className="flex-row items-baseline gap-1.5">
            {lineCompareAt && <Text className="text-xs text-muted-foreground line-through">{formatMoney(lineCompareAt, currency)}</Text>}
            <Text className="text-sm font-extrabold">{formatMoney(item.lineTotal, currency)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function EmptyCart() {
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8 pb-16">
      <View className="size-20 items-center justify-center rounded-full bg-muted">
        <Icon as={ShoppingBag} size={34} className="text-muted-foreground" />
      </View>
      <Text className="text-center text-lg font-extrabold">Your cart is empty</Text>
      <Text className="text-center text-sm text-muted-foreground">Add some items to get started.</Text>
      <Button onPress={() => router.navigate("/")} className="mt-1 h-11 rounded-lg px-6">
        <Text className="font-semibold">Start shopping</Text>
      </Button>
    </View>
  );
}

type PaymentSheetProps = { open: boolean; methods: PaymentMethod[]; selected: PaymentMethod; timeoutMinutes: number; onSelect: (method: PaymentMethod) => void; onClose: () => void };

function PaymentSheet({ open, methods, selected, timeoutMinutes, onSelect, onClose }: PaymentSheetProps) {
  const insets = useSafeAreaInsets();
  const detail: Record<PaymentMethod, string> = {
    COD: "Pay by cash or UPI when your order arrives.",
    ONLINE: `UPI, cards or net banking. Pay within ${timeoutMinutes} minutes of ordering.`,
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable onPress={onClose} className="absolute inset-0 bg-black/50" accessibilityLabel="Close" />
        <View className="gap-3 rounded-t-2xl bg-card px-4 pt-4" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-extrabold">Pay using</Text>
            <Pressable onPress={onClose} className="size-8 items-center justify-center rounded-full bg-muted active:opacity-70" accessibilityLabel="Close" hitSlop={8}>
              <Icon as={X} size={16} />
            </Pressable>
          </View>
          {methods.map((method) => {
            const isSelected = method === selected;
            return (
              <Pressable
                key={method}
                onPress={() => {
                  onSelect(method);
                  onClose();
                }}
                className={cn("flex-row items-center gap-3 rounded-lg border p-3 active:opacity-80", isSelected ? "border-primary bg-primary/5" : "border-border")}
                accessibilityRole="radio"
                accessibilityState={{ checked: isSelected }}
              >
                <Icon as={PAYMENT_TEXT[method].icon} size={22} className={isSelected ? "text-primary" : "text-muted-foreground"} />
                <View className="flex-1">
                  <Text className="text-[15px] font-semibold">{PAYMENT_TEXT[method].title}</Text>
                  <Text className="text-xs text-muted-foreground">{detail[method]}</Text>
                </View>
                <View className={cn("size-5 items-center justify-center rounded-full border-2", isSelected ? "border-primary" : "border-border")}>
                  {isSelected && <View className="size-2.5 rounded-full bg-primary" />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

function CouponCard({ coupon, discount, currency }: { coupon: CartCoupon | null; discount: string | null; currency: string }) {
  const surface = useCardSurface();
  const { apply, remove } = useCouponActions();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (coupon) {
    const saving = coupon.applied && discount && Number(discount) > 0 ? `You save ${formatMoney(discount, currency)}` : null;
    return (
      <View className={cn("mx-4 flex-row items-center gap-3 rounded-lg p-4", surface)}>
        <Icon as={TicketPercent} size={20} className={coupon.applied ? "text-primary" : "text-muted-foreground"} />
        <View className="flex-1 gap-0.5">
          <Text className="text-sm font-bold">{coupon.code}</Text>
          {coupon.applied ? (
            <Text className="text-xs text-muted-foreground">{[saving, coupon.description].filter(Boolean).join(" · ")}</Text>
          ) : (
            <Text className="text-xs font-semibold text-destructive">{coupon.message}</Text>
          )}
        </View>
        <Pressable onPress={() => remove.mutate()} disabled={remove.isPending} hitSlop={8} className="active:opacity-70">
          <Text className="text-sm font-bold text-primary">Remove</Text>
        </Pressable>
      </View>
    );
  }

  const submit = () => {
    const value = code.trim();
    if (!value) return;
    apply.mutate(value, {
      onSuccess: () => {
        setCode("");
        setError(null);
      },
      onError: (failure) => setError(errorMessage(failure)),
    });
  };

  return (
    <View className={cn("mx-4 gap-2 rounded-lg p-4", surface)}>
      <View className="flex-row items-center gap-2">
        <Icon as={TicketPercent} size={20} className="text-primary" />
        <Text className="text-base font-bold">Coupon</Text>
      </View>
      <View className="flex-row gap-2">
        <Input
          value={code}
          onChangeText={(text) => {
            setCode(text.toUpperCase());
            setError(null);
          }}
          onSubmitEditing={submit}
          placeholder="Enter coupon code"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
          returnKeyType="done"
          className={cn("h-11 flex-1 rounded-lg bg-card", error && "border-destructive")}
          aria-invalid={Boolean(error)}
        />
        <Button variant="outline" onPress={submit} disabled={!code.trim() || apply.isPending} className="h-11 rounded-lg px-4">
          {apply.isPending ? <ActivityIndicator /> : <Text className="text-sm font-bold">Apply</Text>}
        </Button>
      </View>
      {error && <Text className="text-xs text-destructive">{error}</Text>}
    </View>
  );
}

function CartSuggestions({ items }: { items: CartItem[] }) {
  const query = useAlsoBought([...new Set(items.map((item) => item.productId))]);
  return <ProductRow title="You might also like" products={query.data?.items ?? []} />;
}

function CartContent({ cart }: { cart: Cart }) {
  const insets = useSafeAreaInsets();
  const surface = useCardSurface();
  const { colors } = useAppTheme();
  const settings = useSettings();
  const { currency, payments, pricing } = settings;
  const { address } = useDeliveryAddress();
  const queryClient = useQueryClient();
  const updating = useCartUpdating();
  const placeOrder = usePlaceOrder();
  const [method, setMethod] = useState<PaymentMethod>(payments.methods[0] ?? "COD");
  const [choosingPayment, setChoosingPayment] = useState(false);

  const items = visibleItems(cart);
  const orderable = items.filter((item) => item.issue === null);
  const blocker = checkoutBlocker(cart, settings);
  const methods = cart.checkout?.paymentMethods ?? payments.methods;
  const payWith = methods.includes(method) ? method : (methods[0] ?? method);
  const weightGrams = visibleItems(cart).reduce((sum, item) => sum + (item.weightGrams ?? 0) * item.quantity, 0);
  const serviceability = useServiceability(address?.postalCode ?? "", weightGrams, payWith === "COD");
  const codNote = codUnavailableText(cart, currency);
  const deliveryBlocked = !!address && serviceability.data?.serviceable === false;
  const codBlocked = !!address && payWith === "COD" && serviceability.data?.codAvailable === false;
  const deliveryChecking = !!address && serviceability.isFetching && !serviceability.data;
  const pincodeInvalid = !!address && !/^\d{6}$/.test(address.postalCode);
  const changeAddress = () => router.push("/select-address");

  // mutateAsync, not mutate callbacks: those are dropped if this screen unmounts first.
  async function submit() {
    if (!address) {
      changeAddress();
      return;
    }
    if (deliveryBlocked || codBlocked || deliveryChecking || serviceability.isError || pincodeInvalid) return;
    let order: OrderDetail;
    try {
      order = await placeOrder.mutateAsync({ addressId: address.id, paymentMethod: payWith });
    } catch (error) {
      showOrderError(error);
      queryClient.invalidateQueries({ queryKey: CART_KEY });
      return;
    }
    router.dismissAll();
    router.push({ pathname: "/order/[id]", params: { id: order.id, placed: "1" } });
    if (order.status === "PENDING_PAYMENT") router.push({ pathname: "/pay/[id]", params: { id: order.id } });
  }

  return (
    <>
      <ScrollView contentContainerClassName="gap-4 pb-6 pt-1">
        <View className={cn("mx-4 rounded-lg px-3", surface)}>
          <View className="flex-row items-center gap-3 pt-3">
            <View className="size-9 items-center justify-center rounded-full bg-primary/10">
              <Icon as={ShoppingBag} size={18} className="text-primary" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-extrabold">Your items</Text>
              <Text className="text-xs text-muted-foreground">
                {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
              </Text>
            </View>
          </View>
          {items.map((item, index) => (
            <View key={item.variantId} className={cn(index > 0 && "border-t border-border")}>
              <CartLine item={item} currency={currency} />
            </View>
          ))}
        </View>

        <CartSuggestions items={items} />

        <CouponCard coupon={cart.coupon} discount={cart.bill?.discount ?? null} currency={currency} />

        {cart.bill && (
          <BillDetails
            bill={{
              ...cart.bill,
              codFee: payWith === "COD" ? cart.bill.codFee : "0.00",
              total: payWith === "COD" ? cart.bill.totalWithCod : cart.bill.total,
            }}
            itemsCompareAt={compareAtTotal(orderable)}
            regularShippingFee={pricing.shippingFee}
            couponCode={cart.coupon?.applied ? cart.coupon.code : null}
            stale={updating}
          />
        )}

        <View className={cn("mx-4 flex-row gap-3 rounded-lg p-4", surface)}>
          <Icon as={Info} size={18} className="mt-0.5 text-muted-foreground" />
          <View className="flex-1 gap-0.5">
            <Text className="text-sm font-bold">Cancellation policy</Text>
            <Text className="text-xs leading-4 text-muted-foreground">
              You can cancel your order until it is packed. If you paid online, the full amount is refunded.
            </Text>
          </View>
        </View>
        {address && (serviceability.isError || deliveryBlocked || codBlocked || pincodeInvalid) ? (
          <Pressable onPress={serviceability.isError ? () => void serviceability.refetch() : undefined} accessibilityRole={serviceability.isError ? "button" : undefined}>
            <Text className="mx-4 text-sm text-destructive">
              {pincodeInvalid ? "Update this address with a valid 6-digit PIN code." : serviceability.isError ? "Delivery availability could not be checked. Tap to retry." : deliveryBlocked ? "Delivery is not available at this PIN code." : "Cash on delivery is not available at this PIN code. Choose online payment."}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View className="border-t border-border bg-card" style={{ paddingBottom: insets.bottom + 10 }}>
        <Pressable onPress={changeAddress} className="flex-row items-center gap-3 border-b border-border px-4 py-2.5 active:bg-accent">
          <View className="size-9 items-center justify-center rounded-full bg-primary/10">
            <Icon as={House} size={18} className="text-primary" />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold" numberOfLines={1}>
              {address ? `Delivering to ${addressLabel(address)}` : "Where should we deliver?"}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {address ? addressSummary(address) : "Choose a saved address for delivery."}
            </Text>
          </View>
          <Text className="text-sm font-bold text-primary">{address ? "Change" : "Choose"}</Text>
        </Pressable>

        {(blocker ?? codNote) && <Text className="px-4 pt-2 text-center text-xs text-muted-foreground">{blocker ?? codNote}</Text>}

        <View className="flex-row items-center gap-3 px-4 pt-2.5">
          <Pressable
            onPress={() => setChoosingPayment(true)}
            disabled={methods.length < 2}
            className="min-w-24 shrink active:opacity-70"
            accessibilityLabel="Change payment method"
          >
            <View className="flex-row items-center gap-1">
              <Icon as={PAYMENT_TEXT[payWith].icon} size={14} className="text-muted-foreground" />
              <Text className="text-[11px] font-semibold uppercase text-muted-foreground">Pay using</Text>
              {methods.length > 1 && <Icon as={ChevronUp} size={14} className="text-muted-foreground" />}
            </View>
            <Text className="text-sm font-bold" numberOfLines={1}>
              {PAYMENT_TEXT[payWith].title}
            </Text>
          </Pressable>
          <Button
            disabled={(address ? blocker !== null || deliveryBlocked || codBlocked || deliveryChecking || serviceability.isError || pincodeInvalid : false) || updating || placeOrder.isPending}
            onPress={submit}
            className="h-14 flex-1 flex-row justify-between rounded-lg px-4"
          >
            {address ? (
              <View>
                <Text className="text-base font-extrabold">
                  {cart.bill ? formatMoney(payWith === "COD" ? cart.bill.totalWithCod : cart.bill.total, currency) : ""}
                </Text>
                <Text className="text-[11px] font-semibold uppercase">Total</Text>
              </View>
            ) : (
              <View />
            )}
            {placeOrder.isPending ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <View className="flex-row items-center gap-0.5">
                <Text className="text-base font-extrabold">{!address ? "Choose address" : payWith === "COD" ? "Place order" : "Pay & order"}</Text>
                <Icon as={ChevronRight} size={18} className="text-primary-foreground" />
              </View>
            )}
          </Button>
        </View>
      </View>

      <PaymentSheet
        open={choosingPayment}
        methods={methods}
        selected={payWith}
        timeoutMinutes={payments.onlinePaymentTimeoutMinutes}
        onSelect={setMethod}
        onClose={() => setChoosingPayment(false)}
      />
    </>
  );
}

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const cart = useCart({ refetchOnMount: "always" });
  const { clear } = useCartActions();
  const hasItems = cart.data ? cart.data.itemCount > 0 : false;

  const confirmClear = () =>
    Alert.alert("Clear cart?", "All items will be removed from your cart.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: clear },
    ]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader
        title="Checkout"
        right={
          hasItems ? (
            <Pressable onPress={confirmClear} className="size-11 items-center justify-center rounded-full active:bg-accent" accessibilityLabel="Clear cart" hitSlop={8}>
              <Icon as={Trash2} size={20} />
            </Pressable>
          ) : null
        }
      />
      {cart.data ? (
        hasItems ? (
          <CartContent cart={cart.data} />
        ) : (
          <EmptyCart />
        )
      ) : cart.isPending ? (
        <ActivityIndicator color={colors.primary} className="py-12" />
      ) : (
        <QueryError error={cart.error} onRetry={() => cart.refetch()} />
      )}
    </View>
  );
}
