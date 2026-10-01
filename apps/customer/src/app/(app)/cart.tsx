import { Image } from "expo-image";
import { router } from "expo-router";
import { MapPin, ShoppingBag, Trash2, TriangleAlert } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { QuantityStepper } from "@/components/add-to-cart";
import { BillDetails } from "@/components/bill-details";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { checkoutBlocker, useCart, useCartActions, useCartUpdating, visibleItems } from "@/lib/cart";
import { useDeliveryLocation } from "@/lib/delivery-location";
import { formatMoney, formatPackSize } from "@/lib/format";
import { openProduct } from "@/lib/navigation";
import { useSettings } from "@/lib/settings";
import type { Cart, CartItem } from "@/lib/types";
import { cn } from "@/lib/utils";

function CartLine({ item, currency }: { item: CartItem; currency: string }) {
  const { setQuantity } = useCartActions();
  const [failed, setFailed] = useState(false);
  const packSize = formatPackSize(item.packQuantity, item.unit);
  const blockedText = item.issue === "UNAVAILABLE" ? "No longer sold at this store" : item.issue === "OUT_OF_STOCK" ? "Out of stock" : null;
  const blocked = blockedText !== null;

  return (
    <View className="flex-row gap-3 py-3">
      <Pressable onPress={() => openProduct(item.productId)} className="size-16 items-center justify-center overflow-hidden rounded-md bg-tile active:opacity-80">
        <View className={cn("size-full items-center justify-center", blocked && "opacity-40")}>
          {item.imageUrl && !failed ? (
            <Image source={{ uri: item.imageUrl }} style={{ width: "86%", height: "86%" }} contentFit="contain" onError={() => setFailed(true)} />
          ) : (
            <Text className="text-xl font-extrabold text-primary">{item.name.charAt(0)}</Text>
          )}
        </View>
      </Pressable>

      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-semibold leading-tight" numberOfLines={2}>
          {item.name}
        </Text>
        {packSize && <Text className="text-xs text-muted-foreground">{packSize}</Text>}
        {item.unitPrice && (
          <View className="flex-row items-baseline gap-1.5">
            <Text className="text-[13px] font-bold">{formatMoney(item.unitPrice, currency)}</Text>
            {item.mrp && item.mrp !== item.unitPrice && <Text className="text-xs text-muted-foreground line-through">{formatMoney(item.mrp, currency)}</Text>}
          </View>
        )}
        {blockedText && <Text className="text-xs font-semibold text-destructive">{blockedText}</Text>}
        {item.issue === "INSUFFICIENT_STOCK" && (
          <View className="flex-row flex-wrap items-center gap-x-2">
            <Text className="text-xs font-semibold text-destructive">Only {item.availableQuantity} left</Text>
            <Pressable onPress={() => setQuantity(item.productId, item.availableQuantity ?? 0)} hitSlop={6}>
              <Text className="text-xs font-bold text-primary">Update to {item.availableQuantity}</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View className="items-end justify-between gap-2">
        {blocked ? (
          <Button variant="outline" size="sm" onPress={() => setQuantity(item.productId, 0)} className="h-8 rounded-md">
            <Text className="text-xs font-bold">Remove</Text>
          </Button>
        ) : (
          <QuantityStepper quantity={item.quantity} onChange={(next) => setQuantity(item.productId, next)} />
        )}
        {item.lineTotal && !blocked && <Text className="text-sm font-extrabold">{formatMoney(item.lineTotal, currency)}</Text>}
      </View>
    </View>
  );
}

function Notice({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View className="mx-4 gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
      <View className="flex-row gap-2">
        <Icon as={TriangleAlert} size={18} className="text-destructive" />
        <Text className="flex-1 text-sm text-foreground">{children}</Text>
      </View>
      {action}
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
      <Text className="text-center text-sm text-muted-foreground">Add items from your nearest store to get started.</Text>
      <Button onPress={() => router.navigate("/")} className="mt-1 h-11 rounded-lg px-6">
        <Text className="font-semibold">Start shopping</Text>
      </Button>
    </View>
  );
}

function CartContent({ cart }: { cart: Cart }) {
  const insets = useSafeAreaInsets();
  const surface = useCardSurface();
  const { currency } = useSettings();
  const { location, store } = useDeliveryLocation();
  const { clear } = useCartActions();
  const updating = useCartUpdating();
  const items = visibleItems(cart);
  const blocker = checkoutBlocker(cart, store?.id, currency);
  const otherStore = store && cart.store && cart.store.id !== store.id ? cart.store : null;

  return (
    <>
      <ScrollView contentContainerClassName="gap-4 pb-6 pt-1">
        {otherStore ? (
          <Notice
            action={
              <View className="flex-row gap-2">
                <Button variant="outline" onPress={clear} className="h-9 flex-1 rounded-md">
                  <Text className="text-sm font-semibold">Clear cart</Text>
                </Button>
                <Button variant="outline" onPress={() => router.push("/location")} className="h-9 flex-1 rounded-md">
                  <Text className="text-sm font-semibold">Change location</Text>
                </Button>
              </View>
            }
          >
            These items are from {otherStore.name}, which doesn&apos;t deliver to {location?.label ?? "your location"}. Clear the cart to shop from your nearest store.
          </Notice>
        ) : null}

        <Pressable onPress={() => router.push("/location")} className={cn("mx-4 flex-row items-center gap-3 rounded-lg p-3 active:opacity-80", surface)}>
          <Icon as={MapPin} size={20} className="text-primary" />
          <View className="flex-1">
            <Text className="text-sm font-bold" numberOfLines={1}>
              {location ? `Delivering to ${location.label}` : "Set a delivery location"}
            </Text>
            {location && (
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {location.summary}
              </Text>
            )}
          </View>
          <Text className="text-sm font-bold text-primary">Change</Text>
        </Pressable>

        <View className={cn("mx-4 rounded-lg px-3", surface)}>
          {cart.store && <Text className="pt-3 text-xs font-semibold uppercase text-muted-foreground">From {cart.store.name}</Text>}
          {items.map((item, index) => (
            <View key={item.productId} className={cn(index > 0 && "border-t border-border")}>
              <CartLine item={item} currency={currency} />
            </View>
          ))}
        </View>

        {cart.bill && <BillDetails bill={cart.bill} stale={updating} />}
      </ScrollView>

      <View className="gap-2 border-t border-border bg-card px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        {blocker && <Text className="text-center text-xs text-muted-foreground">{blocker}</Text>}
        <Button
          disabled={blocker !== null || updating}
          onPress={() => router.push("/checkout")}
          className="h-14 flex-row justify-between rounded-lg px-4"
        >
          <View>
            <Text className="text-base font-extrabold">{cart.bill ? formatMoney(cart.bill.total, currency) : ""}</Text>
            <Text className="text-[11px] font-semibold uppercase">Total</Text>
          </View>
          <Text className="text-base font-extrabold">Proceed to checkout</Text>
        </Button>
      </View>
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
        title="Cart"
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
