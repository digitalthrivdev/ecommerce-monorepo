import { router, useLocalSearchParams } from "expo-router";
import { CircleCheck, CircleX, KeyRound, MapPin, Phone, Wallet } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BillDetails } from "@/components/bill-details";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { ORDER_STATUS_TEXT, ORDER_STEPS, orderStep, useCancelOrder, useOrder } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { useSettings } from "@/lib/settings";
import type { OrderDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

function Card({ children, className }: { children: ReactNode; className?: string }) {
  const surface = useCardSurface();
  return <View className={cn("mx-4 gap-3 rounded-lg p-4", surface, className)}>{children}</View>;
}

function StatusCard({ order, placed }: { order: OrderDetail; placed: boolean }) {
  const step = orderStep(order.status);
  const text = ORDER_STATUS_TEXT[order.status];
  const cancelled = order.status === "CANCELLED";
  const justPlaced = placed && step === 0;

  return (
    <Card>
      <View className="flex-row items-center gap-3">
        {cancelled ? <Icon as={CircleX} size={30} className="text-destructive" /> : step !== null && <Icon as={CircleCheck} size={30} className="text-primary" />}
        <View className="flex-1">
          <Text className="text-lg font-extrabold">{justPlaced ? "Order placed!" : text.title}</Text>
          <Text className="text-sm text-muted-foreground">{justPlaced ? `Thanks! ${order.store.name} will start packing it soon.` : text.detail}</Text>
        </View>
      </View>
      {step !== null && (
        <View className="gap-1.5">
          <View className="flex-row gap-1">
            {ORDER_STEPS.map((label, index) => (
              <View key={label} className={cn("h-1.5 flex-1 rounded-full", index <= step ? "bg-primary" : "bg-muted")} />
            ))}
          </View>
          <View className="flex-row">
            {ORDER_STEPS.map((label, index) => (
              <Text key={label} className={cn("flex-1 text-center text-[10px]", index === step ? "font-bold text-primary" : "text-muted-foreground")}>
                {label}
              </Text>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}

function PaymentPending({ order }: { order: OrderDetail }) {
  const { currency } = useSettings();
  const failed = order.payment?.status === "FAILED";

  return (
    <Card className="border border-destructive/30 bg-destructive/10">
      <View className="gap-1">
        <Text className="text-base font-bold">{failed ? "Payment failed" : "Payment pending"}</Text>
        <Text className="text-sm text-muted-foreground">
          Pay {formatMoney(order.total, currency)}
          {order.paymentExpiresAt ? ` by ${formatTime(order.paymentExpiresAt)}` : ""} to confirm your order, or it will be cancelled.
        </Text>
      </View>
      <Button onPress={() => router.push({ pathname: "/pay/[id]", params: { id: order.id } })} className="h-11 rounded-lg">
        <Text className="font-semibold">{failed ? "Try again" : "Pay now"}</Text>
      </Button>
    </Card>
  );
}

function paymentText(order: OrderDetail, currency: string) {
  const status = order.payment?.status;
  if (order.paymentMethod === "COD") return status === "PAID" ? "Paid on delivery" : "Cash on delivery";
  if (status === "PAID" && order.payment && Number(order.payment.refundedAmount) > 0) {
    return `Paid online · ${formatMoney(order.payment.refundedAmount, currency)} refunded for unavailable items`;
  }
  if (status === "PAID") return "Paid online";
  if (status === "REFUNDED") return "Refunded";
  return "Online payment not completed";
}

function OrderBody({ order, placed }: { order: OrderDetail; placed: boolean }) {
  const { currency } = useSettings();
  const cancel = useCancelOrder(order.id);
  const partner = order.delivery?.partner;
  const address = order.deliveryAddress;

  const confirmCancel = () =>
    Alert.alert("Cancel order?", order.payment?.status === "PAID" ? "Your payment will be refunded." : "This can't be undone.", [
      { text: "Keep order", style: "cancel" },
      { text: "Cancel order", style: "destructive", onPress: () => cancel.mutate(undefined, { onError: (error) => Alert.alert("Couldn't cancel", errorMessage(error)) }) },
    ]);

  return (
    <>
      <StatusCard order={order} placed={placed} />

      {order.status === "PENDING_PAYMENT" && <PaymentPending order={order} />}

      {order.deliveryOtp && (
        <Card className="flex-row items-center">
          <Icon as={KeyRound} size={22} className="text-primary" />
          <View className="flex-1">
            <Text className="text-sm font-bold">Delivery OTP</Text>
            <Text className="text-xs text-muted-foreground">Share it with your delivery partner at the door.</Text>
          </View>
          <Text className="text-2xl font-extrabold tracking-[4px]">{order.deliveryOtp}</Text>
        </Card>
      )}

      {partner && (
        <Card className="flex-row items-center">
          <View className="flex-1">
            <Text className="text-sm font-bold">{partner.name ?? "Delivery partner"}</Text>
            <Text className="text-xs text-muted-foreground">{[partner.vehicleType, partner.vehicleNumber].filter(Boolean).join(" · ") || "Your delivery partner"}</Text>
          </View>
          <Button variant="outline" size="sm" onPress={() => Linking.openURL(`tel:${partner.phone}`)} className="h-9 rounded-md">
            <Icon as={Phone} size={16} />
            <Text className="font-semibold">Call</Text>
          </Button>
        </Card>
      )}

      <Card>
        <Text className="text-base font-bold">
          {order.items.length} {order.items.length === 1 ? "item" : "items"} from {order.store.name}
        </Text>
        {order.items.map((item) => {
          const supplied = item.quantity - item.unavailableQuantity;
          return (
            <View key={item.id} className="flex-row items-start justify-between gap-3">
              <View className="flex-1 gap-0.5">
                <Text className={cn("text-sm", supplied === 0 && "text-muted-foreground line-through")} numberOfLines={2}>
                  <Text className={cn("text-sm font-bold", supplied === 0 && "text-muted-foreground")}>{supplied || item.quantity} × </Text>
                  {item.productName}
                </Text>
                {item.unavailableQuantity > 0 && (
                  <Text className="text-xs font-semibold text-destructive">
                    {supplied === 0 ? "Out of stock, not charged" : `${item.unavailableQuantity} out of stock, not charged`}
                  </Text>
                )}
              </View>
              <Text className={cn("text-sm font-semibold", supplied === 0 && "text-muted-foreground")}>{formatMoney(item.chargedTotal, currency)}</Text>
            </View>
          );
        })}
      </Card>

      <BillDetails
        bill={order}
        totalLabel="Total"
        footer={
          <View className="flex-row items-center gap-2 pt-1">
            <Icon as={Wallet} size={16} className="text-muted-foreground" />
            <Text className="flex-1 text-sm text-muted-foreground">{paymentText(order, currency)}</Text>
          </View>
        }
      />

      <Card>
        <View className="flex-row gap-3">
          <Icon as={MapPin} size={20} className="mt-0.5 text-primary" />
          <View className="flex-1 gap-0.5">
            <Text className="text-sm font-bold">Delivering to {address.name}</Text>
            <Text className="text-sm text-muted-foreground">
              {[address.addressLine1, address.addressLine2, address.landmark, address.city, address.postalCode].filter(Boolean).join(", ")}
            </Text>
            <Text className="text-xs text-muted-foreground">{formatPhone(address.phone)}</Text>
          </View>
        </View>
      </Card>

      <View className="gap-0.5 px-5">
        <Text className="text-xs text-muted-foreground">Order {order.orderNumber}</Text>
        <Text className="text-xs text-muted-foreground">Placed {formatDateTime(order.createdAt)}</Text>
      </View>

      {order.canCancel && (
        <Pressable onPress={confirmCancel} disabled={cancel.isPending} className="mx-4 items-center rounded-lg py-3 active:bg-accent">
          <Text className="font-semibold text-destructive">{cancel.isPending ? "Cancelling…" : "Cancel order"}</Text>
        </Pressable>
      )}
    </>
  );
}

export default function OrderScreen() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const order = useOrder(id);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await order.refetch();
    setRefreshing(false);
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title="Order details" />
      {order.data ? (
        <ScrollView
          contentContainerClassName="gap-4 pt-1"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        >
          <OrderBody order={order.data} placed={placed === "1"} />
        </ScrollView>
      ) : order.isPending ? (
        <ActivityIndicator color={colors.primary} className="py-12" />
      ) : (
        <QueryError error={order.error} onRetry={() => order.refetch()} />
      )}
    </View>
  );
}
