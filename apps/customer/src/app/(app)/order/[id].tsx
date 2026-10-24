import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import {
  Bell,
  Check,
  CircleCheck,
  CircleX,
  FileText,
  Headset,
  MapPin,
  MessageSquareWarning,
  ShoppingBag,
  Star,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Animated, BackHandler, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BillDetails, compareAtTotal } from "@/components/bill-details";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { smallImage } from "@/lib/images";
import {
  COMPLAINT_REASON_TEXT,
  isOrderFinished,
  ORDER_STATUS_TEXT,
  SHIPMENT_STATUS_TEXT,
  useCancelOrder,
  useOpenInvoice,
  useOrder,
} from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { useNotificationsBlocked } from "@/lib/push";
import { useOrderReviews, useReviewProduct } from "@/lib/reviews";
import { useSettings } from "@/lib/settings";
import type { OrderDetail, OrderReviewItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const PLACED_SCREEN_MS = 1800;

function Card({ children, className }: { children: ReactNode; className?: string }) {
  const surface = useCardSurface();
  return <View className={cn("mx-4 gap-3 rounded-lg p-4", surface, className)}>{children}</View>;
}

type InfoCardProps = { icon: LucideIcon; title: string; detail?: string; right?: ReactNode; action?: { label: string; onPress: () => void }; children?: ReactNode };

/** Icon, title and detail, with an optional link-style action along the bottom. */
function InfoCard({ icon, title, detail, right, action, children }: InfoCardProps) {
  const surface = useCardSurface();
  return (
    <View className={cn("mx-4 overflow-hidden rounded-lg", surface)}>
      <View className="gap-3 p-4">
        <View className="flex-row items-center gap-3">
          <View className="size-11 items-center justify-center rounded-full bg-muted">
            <Icon as={icon} size={20} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold">{title}</Text>
            {detail ? <Text className="text-xs text-muted-foreground">{detail}</Text> : null}
          </View>
          {right}
        </View>
        {children}
      </View>
      {action && (
        <Pressable onPress={action.onPress} className="items-center border-t border-border py-3 active:bg-accent">
          <Text className="text-sm font-bold text-primary">{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Delivered, cancelled, returned or awaiting payment. */
function StatusCard({ order }: { order: OrderDetail }) {
  const text = ORDER_STATUS_TEXT[order.status];
  const failed = order.status === "CANCELLED" || order.status === "RTO";
  const deliveredAt = order.status === "DELIVERED" ? order.deliveredAt : null;

  return (
    <Card className="flex-row items-center">
      {failed ? <Icon as={CircleX} size={30} className="text-destructive" /> : <Icon as={CircleCheck} size={30} className="text-primary" />}
      <View className="flex-1">
        <Text className="text-lg font-extrabold">{text.title}</Text>
        <Text className="text-sm text-muted-foreground">{deliveredAt ? `Delivered at ${formatTime(deliveredAt)}. ${text.detail}` : text.detail}</Text>
      </View>
    </Card>
  );
}

/** The courier, the AWB and tracking link. */
function TrackingCard({ shipment }: { shipment: NonNullable<OrderDetail["shipment"]> }) {
  const trackingUrl = shipment.trackingUrl;

  return (
    <InfoCard
      icon={Truck}
      title={shipment.courierName ?? "Shipment"}
      detail={SHIPMENT_STATUS_TEXT[shipment.status]}
      action={trackingUrl ? { label: "Track on courier website", onPress: () => Linking.openURL(trackingUrl) } : undefined}
    >
      {shipment.awb ? (
        <Text selectable className="text-sm text-muted-foreground">
          AWB <Text className="text-sm font-semibold text-foreground">{shipment.awb}</Text>
        </Text>
      ) : null}
    </InfoCard>
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

function paymentText(order: OrderDetail) {
  const status = order.payment?.status;
  if (order.paymentMethod === "COD") return status === "PAID" || status === "REFUNDED" ? "Paid on delivery" : "Cash on delivery";
  if (status === "PAID") return "Paid online";
  if (status === "REFUNDED") return "Refunded";
  return "Online payment not completed";
}

const REFUND_METHOD_TEXT: Record<OrderDetail["refunds"][number]["method"], string> = {
  GATEWAY: "to your original payment method",
  UPI: "by UPI",
  BANK_TRANSFER: "by bank transfer",
};

function ComplaintCard({ order }: { order: OrderDetail }) {
  const complaint = order.returnRequest;
  if (complaint) {
    const title = complaint.status === "OPEN" ? "Return requested" : complaint.status === "APPROVED" ? "Return approved" : complaint.status === "RESOLVED" ? "Return complete" : "Return closed";
    const detail = complaint.status === "OPEN" ? `${COMPLAINT_REASON_TEXT[complaint.reason]} · We're reviewing your request.` : COMPLAINT_REASON_TEXT[complaint.reason];
    return (
      <InfoCard icon={MessageSquareWarning} title={title} detail={detail}>
        {complaint.resolutionNote ? <Text className="text-sm text-muted-foreground">{complaint.resolutionNote}</Text> : null}
        {complaint.reverseCourierName ? <Text className="text-sm text-muted-foreground">{complaint.reverseCourierName}{complaint.reverseAwb ? ` · AWB ${complaint.reverseAwb}` : ""}</Text> : null}
        {complaint.reverseTrackingUrl ? <Pressable accessibilityRole="link" onPress={() => Linking.openURL(complaint.reverseTrackingUrl!)}><Text className="text-sm font-semibold text-primary underline">Track return pickup</Text></Pressable> : null}
      </InfoCard>
    );
  }
  if (!order.canRequestReturn) return null;
  return (
    <InfoCard
      icon={MessageSquareWarning}
      title="Need to return an item?"
      detail="Request a return for eligible items in this order."
      action={{ label: "Request a return", onPress: () => router.push({ pathname: "/returns/[id]", params: { id: order.id } }) }}
    />
  );
}


function ProductReviewRow({ item, orderId }: { item: OrderReviewItem; orderId: string }) {
  const save = useReviewProduct(orderId);
  const [failed, setFailed] = useState(false);
  const rate = (rating: number) => save.mutate({ productId: item.productId, rating }, { onError: (error) => Alert.alert("Couldn't save your rating", errorMessage(error)) });
  const openReview = () => router.push({ pathname: "/review/[productId]", params: { productId: item.productId, orderId } });

  return (
    <View className="flex-row items-center gap-3">
      <View className="size-12 items-center justify-center overflow-hidden rounded-md bg-tile">
        {item.imageUrl && !failed ? (
          <Image source={{ uri: smallImage(item.imageUrl) }} style={{ width: "86%", height: "86%" }} contentFit="contain" onError={() => setFailed(true)} />
        ) : (
          <Text className="text-base font-extrabold text-primary">{item.productName.charAt(0)}</Text>
        )}
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-sm" numberOfLines={2}>
          {item.productName}
        </Text>
        <StarRating value={item.rating ?? 0} onChange={rate} label={`Rate ${item.productName}`} size={22} />
        {item.rating ? (
          <Pressable onPress={openReview} hitSlop={6} className="self-start active:opacity-70">
            <Text className="text-xs font-bold text-primary">{item.comment ? "Edit your review" : "Write a review"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ProductReviewsCard({ order }: { order: OrderDetail }) {
  const reviews = useOrderReviews(order.id, { enabled: order.status === "DELIVERED" });
  const items = reviews.data?.items ?? [];
  if (items.length === 0) return null;
  const pending = items.filter((item) => item.rating === null).length;

  return (
    <InfoCard icon={Star} title="Rate the products" detail={pending ? "Your ratings help other shoppers choose" : "Thanks for rating your products"}>
      {items.map((item) => (
        <ProductReviewRow key={item.productId} item={item} orderId={order.id} />
      ))}
    </InfoCard>
  );
}

function NotificationsCard() {
  const { blocked, enable } = useNotificationsBlocked();
  if (!blocked) return null;
  return (
    <InfoCard
      icon={Bell}
      title="Want to stay up to date?"
      detail="Turn on notifications so we can tell you when your order ships and when it's out for delivery."
      action={{ label: "Turn on notifications", onPress: () => enable().catch(() => {}) }}
    />
  );
}

function HelpCard({ order }: { order: OrderDetail }) {
  const { support } = useSettings();
  if (support.phone) {
    const phone = support.phone;
    return <InfoCard icon={Headset} title="Need help?" detail="Call us about any issue with your order." action={{ label: "Call support", onPress: () => Linking.openURL(`tel:${phone}`) }} />;
  }
  if (support.email) {
    return (
      <InfoCard
        icon={Headset}
        title="Need help?"
        detail="Email us about any issue with your order."
        action={{ label: "Email support", onPress: () => Linking.openURL(`mailto:${support.email}?subject=${encodeURIComponent(`Order ${order.orderNumber}`)}`) }}
      />
    );
  }
  return null;
}

function OrderItemRow({ item, currency }: { item: OrderDetail["items"][number]; currency: string }) {
  const [failed, setFailed] = useState(false);
  const supplied = item.quantity - item.unavailableQuantity;

  return (
    <View className="flex-row items-center gap-3">
      <View className={cn("size-12 items-center justify-center overflow-hidden rounded-md bg-tile", supplied === 0 && "opacity-40")}>
        {item.imageUrl && !failed ? (
          <Image source={{ uri: smallImage(item.imageUrl) }} style={{ width: "86%", height: "86%" }} contentFit="contain" onError={() => setFailed(true)} />
        ) : (
          <Text className="text-base font-extrabold text-primary">{item.productName.charAt(0)}</Text>
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className={cn("text-sm", supplied === 0 && "text-muted-foreground line-through")} numberOfLines={2}>
          {item.productName}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {[item.variantName, `× ${supplied || item.quantity}`].filter(Boolean).join(" ")}
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
}

function OrderBody({ order }: { order: OrderDetail }) {
  const { currency } = useSettings();
  const cancel = useCancelOrder(order.id);
  const invoice = useOpenInvoice(order.id);
  const address = order.deliveryAddress;
  const hasInvoice = order.invoiceNumber !== null && order.status !== "CANCELLED";
  const chargedLines = order.items.map((item) => ({ compareAtPrice: item.compareAtPrice, unitPrice: item.unitPrice, quantity: item.quantity - item.unavailableQuantity }));

  const confirmCancel = () =>
    Alert.alert("Cancel order?", order.payment?.status === "PAID" ? "Your payment will be refunded." : "This can't be undone.", [
      { text: "Keep order", style: "cancel" },
      { text: "Cancel order", style: "destructive", onPress: () => cancel.mutate(undefined, { onError: (error) => Alert.alert("Couldn't cancel", errorMessage(error)) }) },
    ]);

  return (
    <>
      <StatusCard order={order} />

      {order.status === "PENDING_PAYMENT" && <PaymentPending order={order} />}

      {order.shipment && order.shipment.status !== "CANCELLED" && <TrackingCard shipment={order.shipment} />}

      <ProductReviewsCard order={order} />

      <ComplaintCard order={order} />

      {!isOrderFinished(order.status) && <NotificationsCard />}

      <InfoCard icon={MapPin} title="Your delivery details">
        <View className="gap-0.5">
          <Text className="text-sm font-semibold">Delivering to {address.name}</Text>
          <Text className="text-sm text-muted-foreground">
            {[address.addressLine1, address.addressLine2, address.landmark, address.city, address.postalCode].filter(Boolean).join(", ")}
          </Text>
          <Text className="text-xs text-muted-foreground">{formatPhone(address.phone)}</Text>
        </View>
      </InfoCard>

      <HelpCard order={order} />

      <InfoCard icon={ShoppingBag} title="Order summary" detail={`Order ${order.orderNumber}`}>
        {order.items.map((item) => (
          <OrderItemRow key={item.id} item={item} currency={currency} />
        ))}
      </InfoCard>

      <BillDetails
        bill={order}
        itemsCompareAt={compareAtTotal(chargedLines)}
        totalLabel="Total"
        couponCode={order.couponCode}
        footer={
          <View className="gap-2 pt-1">
            <View className="flex-row items-center gap-2">
              <Icon as={Wallet} size={16} className="text-muted-foreground" />
              <Text className="flex-1 text-sm text-muted-foreground">{paymentText(order)}</Text>
            </View>
            {order.refunds.map((refund) => (
              <View key={refund.id} className="gap-0.5 pl-6">
                <Text className="text-sm font-semibold">
                  {formatMoney(refund.amount, currency)} refunded {REFUND_METHOD_TEXT[refund.method]}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {refund.reason} · {formatDateTime(refund.createdAt)}
                </Text>
              </View>
            ))}
          </View>
        }
      />

      <View className="gap-0.5 px-5">
        <Text className="text-xs text-muted-foreground">Placed {formatDateTime(order.createdAt)}</Text>
        {hasInvoice && <Text className="text-xs text-muted-foreground">Invoice {order.invoiceNumber}</Text>}
      </View>

      {hasInvoice && (
        <Button
          variant="outline"
          onPress={() => invoice.mutate(undefined, { onError: (error) => Alert.alert("Couldn't open the invoice", errorMessage(error)) })}
          disabled={invoice.isPending}
          className="mx-4 h-11 rounded-lg"
        >
          <Icon as={FileText} size={16} />
          <Text className="font-semibold">{invoice.isPending ? "Opening…" : "Download invoice"}</Text>
        </Button>
      )}

      {order.canCancel && (
        <Pressable onPress={confirmCancel} disabled={cancel.isPending} className="mx-4 items-center rounded-lg py-3 active:bg-accent">
          <Text className="font-semibold text-destructive">{cancel.isPending ? "Cancelling…" : "Cancel order"}</Text>
        </Pressable>
      )}
    </>
  );
}

/** Full-screen confirmation shown after an order is placed, then returns to home. */
function PlacedScreen({ order, onDone }: { order: OrderDetail; onDone: () => void }) {
  const [opacity] = useState(() => new Animated.Value(1));
  const address = order.deliveryAddress;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.delay(PLACED_SCREEN_MS),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => animation.stop();
  }, [opacity, onDone]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity, zIndex: 10 }]}>
      <Pressable onPress={onDone} className="flex-1 items-center justify-center gap-3 bg-background px-8" accessibilityLabel="Continue to home">
        <View className="size-28 items-center justify-center rounded-full bg-primary">
          <Icon as={Check} size={56} className="text-primary-foreground" />
        </View>
        <Text className="pt-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Thank you for your order</Text>
        <Text className="text-center text-2xl font-extrabold">Order placed</Text>
        <Text className="text-center text-sm text-muted-foreground">
          Delivering to {address.name}
          {[address.addressLine1, address.city].filter(Boolean).length > 0 ? ` · ${[address.addressLine1, address.city].filter(Boolean).join(", ")}` : ""}
        </Text>
        <View className="mt-4 rounded-full bg-muted px-4 py-2">
          <Text className="text-xs font-semibold text-muted-foreground">Returning to home…</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function OrderScreen() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const order = useOrder(id);
  const [refreshing, setRefreshing] = useState(false);
  const [showPlaced, setShowPlaced] = useState(placed === "1");
  const handlePlacedDone = useCallback(() => {
    setShowPlaced(false);
    router.replace("/");
  }, []);

  useEffect(() => {
    if (!showPlaced) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handlePlacedDone();
      return true;
    });
    return () => sub.remove();
  }, [showPlaced, handlePlacedDone]);

  async function refresh() {
    setRefreshing(true);
    await order.refetch();
    setRefreshing(false);
  }

  return (
    <View className="flex-1 bg-background">
      <View style={{ paddingTop: insets.top }}>
        <FocusStatusBar />
        <ScreenHeader title="Order details" />
      </View>
      {order.data ? (
        <ScrollView
          contentContainerClassName="gap-4 pt-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        >
          <OrderBody order={order.data} />
        </ScrollView>
      ) : order.isPending ? (
        <ActivityIndicator color={colors.primary} className="py-12" />
      ) : (
        <QueryError error={order.error} onRetry={() => order.refetch()} />
      )}
      {showPlaced && order.data && order.data.status !== "PENDING_PAYMENT" && <PlacedScreen order={order.data} onDone={handlePlacedDone} />}
    </View>
  );
}
