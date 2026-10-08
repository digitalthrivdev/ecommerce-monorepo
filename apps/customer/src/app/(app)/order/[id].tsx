import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  Bell,
  Bike,
  Check,
  CircleCheck,
  CircleX,
  FileText,
  Headset,
  KeyRound,
  MapPin,
  MessageSquareWarning,
  Phone,
  ShoppingBag,
  Star,
  Store,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Animated, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BillDetails, mrpTotal } from "@/components/bill-details";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { FormField } from "@/components/form-field";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { StarRating } from "@/components/star-rating";
import { TrackingMap } from "@/components/tracking-map";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { formatDateTime, formatMoney, formatTime } from "@/lib/format";
import { smallImage } from "@/lib/images";
import { mapsAvailable } from "@/lib/maps";
import {
  COMPLAINT_REASON_TEXT,
  isOrderFinished,
  ORDER_STATUS_TEXT,
  ORDER_STEPS,
  orderStep,
  useCancelOrder,
  useOpenInvoice,
  useOrder,
  useOrderTracking,
  useRateOrder,
} from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { useNotificationsBlocked } from "@/lib/push";
import { useSettings } from "@/lib/settings";
import type { OrderDetail, OrderTracking } from "@/lib/types";
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

/** Being prepared or delivered: shown with the tracking header. */
const isLive = (order: OrderDetail) => !isOrderFinished(order.status) && order.status !== "PENDING_PAYMENT";

function TrackingHeader({ order, tracking }: { order: OrderDetail; tracking: OrderTracking | undefined }) {
  const insets = useSafeAreaInsets();
  const text = ORDER_STATUS_TEXT[order.status];
  const eta = tracking?.etaMinutes ?? null;

  return (
    <View className="bg-primary px-2 pb-4" style={{ paddingTop: insets.top + 4 }}>
      <FocusStatusBar onPrimary />
      <View className="flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="size-11 items-center justify-center rounded-full bg-primary-foreground/15 active:opacity-70"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Icon as={ArrowLeft} size={22} className="text-primary-foreground" />
        </Pressable>
        <View className="flex-1 items-center px-2">
          {eta !== null ? (
            <>
              <Text className="text-sm font-semibold text-primary-foreground">{text.title}</Text>
              <Text className="text-2xl font-extrabold text-primary-foreground">
                Arriving in {eta} {eta === 1 ? "minute" : "minutes"}
              </Text>
            </>
          ) : (
            <>
              <Text className="text-2xl font-extrabold text-primary-foreground">{text.title}</Text>
              <Text className="text-center text-sm font-semibold text-primary-foreground" numberOfLines={2}>
                {text.detail}
              </Text>
            </>
          )}
        </View>
        <View className="size-11" />
      </View>
    </View>
  );
}

function StepsCard({ order, tracking }: { order: OrderDetail; tracking: OrderTracking | undefined }) {
  const step = orderStep(order.status);
  if (step === null) return null;
  const distance = tracking?.distanceKm ?? null;

  return (
    <Card>
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
      {distance !== null && (
        <Text className="text-xs text-muted-foreground">
          Your delivery partner is {distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`} from you.
        </Text>
      )}
    </Card>
  );
}

/** Delivered, cancelled or awaiting payment. */
function StatusCard({ order }: { order: OrderDetail }) {
  const text = ORDER_STATUS_TEXT[order.status];
  const cancelled = order.status === "CANCELLED";
  const deliveredAt = order.status === "DELIVERED" ? order.delivery?.deliveredAt : null;

  return (
    <Card className="flex-row items-center">
      {cancelled ? <Icon as={CircleX} size={30} className="text-destructive" /> : <Icon as={CircleCheck} size={30} className="text-primary" />}
      <View className="flex-1">
        <Text className="text-lg font-extrabold">{text.title}</Text>
        <Text className="text-sm text-muted-foreground">{deliveredAt ? `Delivered at ${formatTime(deliveredAt)}. ${text.detail}` : text.detail}</Text>
      </View>
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
  const complaint = order.complaint;
  if (complaint) {
    const title = complaint.status === "OPEN" ? "Issue reported" : complaint.status === "RESOLVED" ? "Issue resolved" : "Report closed";
    const detail = complaint.status === "OPEN" ? `${COMPLAINT_REASON_TEXT[complaint.reason]} · We're looking into it.` : COMPLAINT_REASON_TEXT[complaint.reason];
    return (
      <InfoCard icon={MessageSquareWarning} title={title} detail={detail}>
        {complaint.resolutionNote ? <Text className="text-sm text-muted-foreground">{complaint.resolutionNote}</Text> : null}
      </InfoCard>
    );
  }
  if (!order.canReportIssue) return null;
  return (
    <InfoCard
      icon={MessageSquareWarning}
      title="Something wrong with your order?"
      detail="Tell us about damaged, wrong or missing items."
      action={{ label: "Report an issue", onPress: () => router.push({ pathname: "/report-issue/[id]", params: { id: order.id } }) }}
    />
  );
}

const DELIVERY_RATING_TEXT = ["", "Very poor", "Poor", "Okay", "Good", "Excellent"] as const;

function RatingCard({ order }: { order: OrderDetail }) {
  const rate = useRateOrder(order.id);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [itemsRating, setItemsRating] = useState(0);
  const [comment, setComment] = useState("");

  const rating = order.rating;
  if (rating) {
    return (
      <Card>
        <View className="flex-row items-center gap-3">
          <Icon as={Star} size={22} className="text-primary" />
          <Text className="flex-1 text-base font-bold">Thanks for your rating</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-muted-foreground">Delivery</Text>
          <StarRating value={rating.deliveryRating} label="Delivery" size={18} />
        </View>
        {rating.itemsRating ? (
          <View className="flex-row items-center justify-between">
            <Text className="text-sm text-muted-foreground">Items</Text>
            <StarRating value={rating.itemsRating} label="Items" size={18} />
          </View>
        ) : null}
        {rating.comment ? <Text className="text-sm text-muted-foreground">“{rating.comment}”</Text> : null}
      </Card>
    );
  }
  if (!order.canRate) return null;

  const submit = () =>
    rate.mutate(
      { deliveryRating, ...(itemsRating > 0 && { itemsRating }), ...(comment.trim() && { comment: comment.trim() }) },
      { onError: (error) => Alert.alert("Couldn't send your rating", errorMessage(error)) },
    );

  return (
    <Card>
      <View className="gap-0.5">
        <Text className="text-base font-bold">Rate your order</Text>
        <Text className="text-sm text-muted-foreground">How was the delivery?</Text>
      </View>
      <View className="flex-row items-center gap-3">
        <StarRating value={deliveryRating} onChange={setDeliveryRating} label="Delivery rating" />
        {deliveryRating > 0 && <Text className="text-sm font-semibold text-muted-foreground">{DELIVERY_RATING_TEXT[deliveryRating]}</Text>}
      </View>
      {deliveryRating > 0 && (
        <>
          <View className="gap-1.5">
            <Text className="text-sm font-semibold">
              And the items?<Text className="text-sm font-normal text-muted-foreground"> (optional)</Text>
            </Text>
            <StarRating value={itemsRating} onChange={(value) => setItemsRating(value === itemsRating ? 0 : value)} label="Items rating" size={28} />
          </View>
          <FormField
            label="Anything to add?"
            optional
            value={comment}
            onChangeText={setComment}
            placeholder="The rider was quick and polite"
            multiline
            maxLength={500}
            textAlignVertical="top"
            className="h-20 py-3"
          />
          <Button onPress={submit} disabled={rate.isPending} className="h-11 rounded-lg">
            <Text className="font-semibold">{rate.isPending ? "Sending…" : "Submit rating"}</Text>
          </Button>
        </>
      )}
    </Card>
  );
}

function NotificationsCard() {
  const { blocked, enable } = useNotificationsBlocked();
  if (!blocked) return null;
  return (
    <InfoCard
      icon={Bell}
      title="Want to stay up to date?"
      detail="Turn on notifications so we can tell you when your order is packed and on its way."
      action={{ label: "Turn on notifications", onPress: () => enable().catch(() => {}) }}
    />
  );
}

function HelpCard({ order }: { order: OrderDetail }) {
  const { support } = useSettings();
  const phone = support.phone ?? (isLive(order) ? null : order.store.phone);
  if (phone) {
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

function OrderBody({ order, tracking }: { order: OrderDetail; tracking: OrderTracking | undefined }) {
  const { currency } = useSettings();
  const cancel = useCancelOrder(order.id);
  const invoice = useOpenInvoice(order.id);
  const partner = order.delivery?.partner;
  const address = order.deliveryAddress;
  const live = isLive(order);
  const chargedLines = order.items.map((item) => ({ mrp: item.mrp, unitPrice: item.unitPrice, quantity: item.quantity - item.unavailableQuantity }));

  const confirmCancel = () =>
    Alert.alert("Cancel order?", order.payment?.status === "PAID" ? "Your payment will be refunded." : "This can't be undone.", [
      { text: "Keep order", style: "cancel" },
      { text: "Cancel order", style: "destructive", onPress: () => cancel.mutate(undefined, { onError: (error) => Alert.alert("Couldn't cancel", errorMessage(error)) }) },
    ]);

  return (
    <>
      {live && mapsAvailable && tracking?.trackable && <TrackingMap tracking={tracking} />}

      {live ? <StepsCard order={order} tracking={tracking} /> : <StatusCard order={order} />}

      {order.status === "PENDING_PAYMENT" && <PaymentPending order={order} />}

      <RatingCard order={order} />

      <ComplaintCard order={order} />

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

      {partner && live ? (
        <InfoCard
          icon={Bike}
          title={partner.name ?? "Your delivery partner"}
          detail={[partner.vehicleType, partner.vehicleNumber].filter(Boolean).join(" · ") || "Your delivery partner"}
          right={
            <Button variant="outline" size="sm" onPress={() => Linking.openURL(`tel:${partner.phone}`)} className="h-9 rounded-md">
              <Icon as={Phone} size={16} />
              <Text className="font-semibold">Call</Text>
            </Button>
          }
        />
      ) : live ? (
        <InfoCard icon={Bike} title="We'll assign a delivery partner as soon as your order is packed" />
      ) : null}

      {live && order.store.phone && (
        <InfoCard
          icon={Store}
          title={order.store.name}
          detail="Call the store about the items in your order"
          right={
            <Button variant="outline" size="sm" onPress={() => Linking.openURL(`tel:${order.store.phone}`)} className="h-9 rounded-md">
              <Icon as={Phone} size={16} />
              <Text className="font-semibold">Call</Text>
            </Button>
          }
        />
      )}

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

      <InfoCard icon={ShoppingBag} title="Order summary" detail={`Order ${order.orderNumber} · ${order.store.name}`}>
        {order.items.map((item) => (
          <OrderItemRow key={item.id} item={item} currency={currency} />
        ))}
      </InfoCard>

      <BillDetails
        bill={order}
        itemsMrp={mrpTotal(chargedLines)}
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
        {order.invoiceNumber && <Text className="text-xs text-muted-foreground">Invoice {order.invoiceNumber}</Text>}
      </View>

      {order.invoiceNumber && (
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

/** Full-screen confirmation shown for a moment after a cash order is placed. */
function PlacedScreen({ order, onDone }: { order: OrderDetail; onDone: () => void }) {
  const [opacity] = useState(() => new Animated.Value(1));
  const address = order.deliveryAddress;

  useEffect(() => {
    const animation = Animated.sequence([Animated.delay(PLACED_SCREEN_MS), Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true })]);
    animation.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => animation.stop();
  }, [opacity, onDone]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity, zIndex: 10 }]}>
      <Pressable onPress={onDone} className="flex-1 items-center justify-center gap-3 bg-background px-8" accessibilityLabel="Continue to order">
        <View className="size-28 items-center justify-center rounded-full bg-primary">
          <Icon as={Check} size={56} className="text-primary-foreground" />
        </View>
        <Text className="pt-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">Order placed</Text>
        <Text className="text-center text-2xl font-extrabold">Delivering to {address.name}</Text>
        <Text className="text-center text-sm text-muted-foreground">{[address.addressLine1, address.addressLine2, address.city].filter(Boolean).join(", ")}</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function OrderScreen() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const order = useOrder(id);
  const tracking = useOrderTracking(id, order.data?.status);
  const [refreshing, setRefreshing] = useState(false);
  const [showPlaced, setShowPlaced] = useState(placed === "1");
  const hidePlaced = useCallback(() => setShowPlaced(false), []);
  const live = order.data ? isLive(order.data) : false;

  async function refresh() {
    setRefreshing(true);
    await Promise.all([order.refetch(), live ? tracking.refetch() : null]);
    setRefreshing(false);
  }

  return (
    <View className="flex-1 bg-background">
      {live && order.data ? (
        <TrackingHeader order={order.data} tracking={tracking.data} />
      ) : (
        <View style={{ paddingTop: insets.top }}>
          <FocusStatusBar />
          <ScreenHeader title="Order details" />
        </View>
      )}
      {order.data ? (
        <ScrollView
          contentContainerClassName="gap-4 pt-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        >
          <OrderBody order={order.data} tracking={tracking.data} />
        </ScrollView>
      ) : order.isPending ? (
        <ActivityIndicator color={colors.primary} className="py-12" />
      ) : (
        <QueryError error={order.error} onRetry={() => order.refetch()} />
      )}
      {showPlaced && order.data && order.data.status !== "PENDING_PAYMENT" && <PlacedScreen order={order.data} onDone={hidePlaced} />}
    </View>
  );
}
