import { router } from "expo-router";
import { Banknote, CreditCard, MapPin, type LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BillDetails } from "@/components/bill-details";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { addressSummary, useAddresses } from "@/lib/addresses";
import { ApiError, errorMessage } from "@/lib/api";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { checkoutBlocker, useCart, useCartUpdating, visibleItems } from "@/lib/cart";
import { useDeliveryLocation } from "@/lib/delivery-location";
import { formatMoney } from "@/lib/format";
import { usePlaceOrder } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { useSettings } from "@/lib/settings";
import type { PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

const CART_CHANGED_ERRORS = ["CART_EMPTY", "CART_INVALID", "INSUFFICIENT_STOCK", "MIN_ORDER_NOT_MET"];

type Shortage = { name?: string; available?: number };

function cartChangeMessage(error: ApiError) {
  if (!Array.isArray(error.details)) return error.message;
  const lines = (error.details as Shortage[]).map((item) =>
    item.available === undefined ? `${item.name}: no longer available` : `${item.name}: only ${item.available} left`,
  );
  return `${error.message}\n\n${lines.join("\n")}`;
}

function showOrderError(error: unknown) {
  if (error instanceof ApiError && CART_CHANGED_ERRORS.includes(error.code)) {
    Alert.alert("Your cart has changed", cartChangeMessage(error), [{ text: "Review cart", onPress: () => router.back() }]);
    return;
  }
  Alert.alert("Couldn't place your order", errorMessage(error));
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const surface = useCardSurface();
  return (
    <View className={cn("mx-4 gap-3 rounded-lg p-4", surface)}>
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-bold">{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function PaymentOption({ icon, title, detail, selected, onPress }: { icon: LucideIcon; title: string; detail: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={cn("flex-row items-center gap-3 rounded-lg border p-3 active:opacity-80", selected ? "border-primary bg-primary/5" : "border-border")}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Icon as={icon} size={22} className={selected ? "text-primary" : "text-muted-foreground"} />
      <View className="flex-1">
        <Text className="text-[15px] font-semibold">{title}</Text>
        <Text className="text-xs text-muted-foreground">{detail}</Text>
      </View>
      <View className={cn("size-5 items-center justify-center rounded-full border-2", selected ? "border-primary" : "border-border")}>
        {selected && <View className="size-2.5 rounded-full bg-primary" />}
      </View>
    </Pressable>
  );
}

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { currency, payments } = useSettings();
  const cart = useCart().data;
  const updating = useCartUpdating();
  const addresses = useAddresses();
  const { location, store } = useDeliveryLocation();
  const placeOrder = usePlaceOrder();
  const [method, setMethod] = useState<PaymentMethod>(payments.methods[0] ?? "COD");

  const address = location?.kind === "address" ? addresses.data?.find((saved) => saved.id === location.addressId) : undefined;
  const items = cart ? visibleItems(cart) : [];
  const blocker = !cart || items.length === 0 ? "Your cart is empty." : !address ? "Choose a saved address for delivery." : checkoutBlocker(cart, store?.id, currency);
  const changeAddress = () => router.push("/location");

  function submit() {
    if (!address) return;
    placeOrder.mutate(
      { addressId: address.id, paymentMethod: method },
      {
        onSuccess: (order) => {
          router.dismissAll();
          router.push({ pathname: "/order/[id]", params: { id: order.id, placed: "1" } });
          if (order.status === "PENDING_PAYMENT") router.push({ pathname: "/pay/[id]", params: { id: order.id } });
        },
        onError: showOrderError,
      },
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title="Checkout" />
      <ScrollView contentContainerClassName="gap-4 pb-6 pt-1">
        <Section
          title="Delivery address"
          action={
            address ? (
              <Pressable onPress={changeAddress} hitSlop={8}>
                <Text className="text-sm font-bold text-primary">Change</Text>
              </Pressable>
            ) : null
          }
        >
          {address ? (
            <View className="flex-row gap-3">
              <Icon as={MapPin} size={20} className="mt-0.5 text-primary" />
              <View className="flex-1 gap-0.5">
                <Text className="text-sm font-bold">
                  {address.label || "Address"} · {address.name}
                </Text>
                <Text className="text-sm text-muted-foreground">{addressSummary(address)}</Text>
                <Text className="text-xs text-muted-foreground">{formatPhone(address.phone)}</Text>
              </View>
            </View>
          ) : (
            <View className="gap-3">
              <Text className="text-sm text-muted-foreground">
                {location?.kind === "current"
                  ? "Orders are delivered to a saved address. Choose one, or add your current location as a new address."
                  : "Choose where your order should be delivered."}
              </Text>
              <Button variant="outline" onPress={changeAddress} className="h-10 rounded-md">
                <Text className="font-semibold">Choose address</Text>
              </Button>
            </View>
          )}
        </Section>

        <Section title="Payment method">
          {payments.methods.includes("COD") && (
            <PaymentOption icon={Banknote} title="Cash on delivery" detail="Pay by cash or UPI when your order arrives." selected={method === "COD"} onPress={() => setMethod("COD")} />
          )}
          {payments.methods.includes("ONLINE") && (
            <PaymentOption
              icon={CreditCard}
              title="Pay online"
              detail={`UPI, cards or net banking. Pay within ${payments.onlinePaymentTimeoutMinutes} minutes of ordering.`}
              selected={method === "ONLINE"}
              onPress={() => setMethod("ONLINE")}
            />
          )}
        </Section>

        {cart && items.length > 0 && (
          <Section title={`${items.length} ${items.length === 1 ? "item" : "items"}${cart.store ? ` from ${cart.store.name}` : ""}`}>
            {items.map((item) => (
              <View key={item.productId} className="flex-row items-start justify-between gap-3">
                <Text className="flex-1 text-sm" numberOfLines={2}>
                  <Text className="text-sm font-bold">{item.quantity} × </Text>
                  {item.name}
                </Text>
                {item.lineTotal && <Text className="text-sm font-semibold">{formatMoney(item.lineTotal, currency)}</Text>}
              </View>
            ))}
          </Section>
        )}

        {cart?.bill && <BillDetails bill={cart.bill} stale={updating} />}
      </ScrollView>

      <View className="gap-2 border-t border-border bg-card px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        {blocker && <Text className="text-center text-xs text-muted-foreground">{blocker}</Text>}
        <Button
          disabled={blocker !== null || updating || placeOrder.isPending}
          onPress={submit}
          className="h-14 flex-row justify-between rounded-lg px-4"
        >
          <View>
            <Text className="text-base font-extrabold">{cart?.bill ? formatMoney(cart.bill.total, currency) : ""}</Text>
            <Text className="text-[11px] font-semibold uppercase">{method === "COD" ? "Cash on delivery" : "Pay online"}</Text>
          </View>
          {placeOrder.isPending ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text className="text-base font-extrabold">{method === "COD" ? "Place order" : "Place order & pay"}</Text>
          )}
        </Button>
      </View>
    </View>
  );
}
