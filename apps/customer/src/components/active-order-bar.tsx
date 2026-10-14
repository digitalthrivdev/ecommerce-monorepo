import { router } from "expo-router";
import { ChevronRight, CircleCheck, Package, Truck, Wallet, type LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCart } from "@/lib/cart";
import { ORDER_STATUS_TEXT, ORDER_STEPS, orderStep, useActiveOrders } from "@/lib/orders";
import type { OrderStatus, OrderSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

function statusIcon(status: OrderStatus): LucideIcon {
  if (status === "PENDING_PAYMENT") return Wallet;
  if (status === "CONFIRMED") return CircleCheck;
  if (status === "PACKED") return Package;
  return Truck;
}

function StepBar({ status }: { status: OrderStatus }) {
  const step = orderStep(status);
  if (step === null) return null;
  return (
    <View className="mt-1.5 flex-row gap-1">
      {ORDER_STEPS.map((label, index) => (
        <View key={label} className={cn("h-1 flex-1 rounded-full", index <= step ? "bg-primary" : "bg-muted")} />
      ))}
    </View>
  );
}

function openOrders(orders: OrderSummary[]) {
  const [order] = orders;
  if (orders.length > 1) router.push("/orders");
  else if (order.status === "PENDING_PAYMENT") router.push({ pathname: "/pay/[id]", params: { id: order.id } });
  else router.push({ pathname: "/order/[id]", params: { id: order.id } });
}

/** Status of the customer's orders in progress, shown above the tab bar like a delivery tracker. */
export function ActiveOrderBar() {
  const orders = useActiveOrders().data?.items ?? [];
  const cartShown = (useCart().data?.itemCount ?? 0) > 0;

  if (orders.length === 0) return null;

  const latest = orders[0];
  const unpaid = latest.status === "PENDING_PAYMENT";
  const single = orders.length === 1;
  const title = single ? (unpaid ? "Payment pending" : ORDER_STATUS_TEXT[latest.status].title) : `${orders.length} orders in progress`;
  const detail = single
    ? unpaid
      ? "Pay now to confirm your order."
      : ORDER_STATUS_TEXT[latest.status].detail
    : `Latest: ${ORDER_STATUS_TEXT[latest.status].title}`;

  return (
    <View className={cn("bg-background px-3 pt-2", !cartShown && "pb-2")}>
      <Pressable
        onPress={() => openOrders(orders)}
        className="flex-row items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-md shadow-black/10 active:opacity-90"
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${detail}`}
      >
        <View className={cn("size-10 items-center justify-center rounded-full", unpaid ? "bg-destructive/10" : "bg-primary/10")}>
          <Icon as={statusIcon(latest.status)} size={20} className={unpaid ? "text-destructive" : "text-primary"} />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-extrabold" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {detail}
          </Text>
          {single && <StepBar status={latest.status} />}
        </View>
        <View className="flex-row items-center">
          <Text className={cn("text-sm font-bold", unpaid ? "text-destructive" : "text-primary")}>{single ? (unpaid ? "Pay" : "Track") : "View"}</Text>
          <Icon as={ChevronRight} size={18} className={unpaid ? "text-destructive" : "text-primary"} />
        </View>
      </Pressable>
    </View>
  );
}
