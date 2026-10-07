import { router, useLocalSearchParams } from "expo-router";
import { Banknote, Check, CreditCard, MapPin, Navigation, Phone, Store, type LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DeliveryMap } from "@/components/delivery-map";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { OtpInput } from "@/components/otp-input";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ApiError, errorMessage } from "@/lib/api";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { directionsUrl, stepText, useDelivery, useDeliveryAction } from "@/lib/delivery";
import { formatDuration, formatMoney, formatPickup } from "@/lib/format";
import { mapsAvailable } from "@/lib/maps";
import { formatPhone } from "@/lib/phone";
import { useSettings } from "@/lib/settings";
import type { PartnerDelivery } from "@/lib/types";
import { cn } from "@/lib/utils";

const OTP_LENGTH = 4;

function Section({ icon, title, children, actions }: { icon: LucideIcon; title: string; children: ReactNode; actions?: ReactNode }) {
  const surface = useCardSurface();
  return (
    <View className={cn("mx-4 gap-3 rounded-lg p-4", surface)}>
      <View className="flex-row items-center gap-2">
        <Icon as={icon} size={18} className="text-primary" />
        <Text className="text-sm font-bold uppercase text-muted-foreground">{title}</Text>
      </View>
      {children}
      {actions && <View className="flex-row gap-2">{actions}</View>}
    </View>
  );
}

function ContactButtons({ phone, latitude, longitude }: { phone?: string | null; latitude?: string | null; longitude?: string | null }) {
  return (
    <>
      {phone && (
        <Button variant="outline" onPress={() => Linking.openURL(`tel:${phone}`)} className="h-10 flex-1 rounded-md">
          <Icon as={Phone} size={16} />
          <Text className="font-semibold">Call</Text>
        </Button>
      )}
      {latitude && longitude && (
        <Button variant="outline" onPress={() => Linking.openURL(directionsUrl(latitude, longitude))} className="h-10 flex-1 rounded-md">
          <Icon as={Navigation} size={16} />
          <Text className="font-semibold">Directions</Text>
        </Button>
      )}
    </>
  );
}

function otpErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === "INVALID_OTP") {
    const left = (error.details as { attemptsLeft?: number } | undefined)?.attemptsLeft;
    return left !== undefined ? `Wrong OTP. ${left} ${left === 1 ? "try" : "tries"} left.` : "Wrong OTP. Check with the customer.";
  }
  if (error instanceof ApiError && error.code === "TOO_MANY_OTP_ATTEMPTS") {
    return "Too many wrong OTPs. Wait 15 minutes or call the store for help.";
  }
  return errorMessage(error);
}

const itemCount = (delivery: PartnerDelivery) => delivery.items.reduce((sum, item) => sum + item.quantity, 0);

/** Before pickup the partner deliberately checks the order ID against the bill on the bag. */
function ConfirmOrderId({ delivery, confirmed, onToggle }: { delivery: PartnerDelivery; confirmed: boolean; onToggle: () => void }) {
  const count = itemCount(delivery);
  return (
    <Pressable
      onPress={onToggle}
      className={cn("flex-row items-center gap-3 rounded-lg border-2 p-3 active:opacity-80", confirmed ? "border-primary bg-primary/10" : "border-border")}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: confirmed }}
      accessibilityLabel={`Order ID ${delivery.orderNumber} matches the bag`}
    >
      <View className="flex-1 gap-0.5">
        <Text className="text-xs font-bold uppercase text-muted-foreground">Confirm order ID</Text>
        <Text className="text-2xl font-extrabold tracking-wide">{delivery.orderNumber}</Text>
        <Text className="text-xs text-muted-foreground">
          Match it with the bill on the bag and check all {count} {count === 1 ? "item" : "items"}.
        </Text>
      </View>
      <View className={cn("size-7 items-center justify-center rounded-md border-2", confirmed ? "border-primary bg-primary" : "border-border")}>
        {confirmed && <Icon as={Check} size={18} className="text-primary-foreground" />}
      </View>
    </Pressable>
  );
}

function ActionPanel({ delivery, onDelivered }: { delivery: PartnerDelivery; onDelivered: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { currency } = useSettings();
  const run = useDeliveryAction(delivery.orderId);
  const [otp, setOtp] = useState("");
  const [idConfirmed, setIdConfirmed] = useState(false);
  const actions = delivery.allowedActions;
  const cash = Number(delivery.cashToCollect) > 0;

  if (actions.length === 0) return null;

  const fail = (title: string) => (error: unknown) => Alert.alert(title, errorMessage(error));

  function decline() {
    Alert.alert("Decline this delivery?", "It goes back to the store to be assigned to someone else.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: () => run.mutate({ action: "decline" }, { onSuccess: () => router.back(), onError: fail("Couldn't decline") }),
      },
    ]);
  }

  function submitOtp(value: string) {
    run.mutate({ action: "delivered", otp: value }, { onSuccess: onDelivered, onError: () => setOtp("") });
  }

  let content: ReactNode;
  if (actions.includes("accept")) {
    content = (
      <View className="flex-row gap-3">
        <Button variant="outline" onPress={decline} disabled={run.isPending} className="h-12 flex-1 rounded-lg">
          <Text className="font-semibold">Decline</Text>
        </Button>
        <Button onPress={() => run.mutate({ action: "accept" }, { onError: fail("Couldn't accept") })} disabled={run.isPending} className="h-12 flex-[2] rounded-lg">
          {run.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text className="text-base font-bold">Accept delivery</Text>}
        </Button>
      </View>
    );
  } else if (actions.includes("pickup")) {
    content = (
      <View className="gap-3">
        <ConfirmOrderId delivery={delivery} confirmed={idConfirmed} onToggle={() => setIdConfirmed((value) => !value)} />
        <Button
          onPress={() => run.mutate({ action: "pickup" }, { onError: fail("Couldn't mark as picked up") })}
          disabled={!idConfirmed || run.isPending}
          className="h-12 rounded-lg"
        >
          {run.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text className="text-base font-bold">Picked up from store</Text>}
        </Button>
      </View>
    );
  } else if (actions.includes("start-delivery")) {
    content = (
      <Button onPress={() => run.mutate({ action: "start-delivery" }, { onError: fail("Couldn't start the delivery") })} disabled={run.isPending} className="h-12 rounded-lg">
        {run.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text className="text-base font-bold">Start delivery</Text>}
      </Button>
    );
  } else if (actions.includes("delivered")) {
    content = (
      <View className="gap-3">
        <Text className="text-sm font-semibold">Tap the boxes and enter the 4-digit OTP from the customer</Text>
        <OtpInput
          value={otp}
          onChange={(value) => {
            if (run.isError) run.reset();
            setOtp(value);
            if (value.length === OTP_LENGTH) submitOtp(value);
          }}
          length={OTP_LENGTH}
          invalid={run.isError}
          editable={!run.isPending}
          autoFocus={false}
        />
        {run.isPending ? (
          <ActivityIndicator color={colors.primary} />
        ) : run.isError ? (
          <Text className="text-sm text-destructive">{otpErrorMessage(run.error)}</Text>
        ) : cash ? (
          <Text className="text-sm font-semibold">Collect {formatMoney(delivery.cashToCollect, currency)} before handing over the order.</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View className="border-t border-border bg-card px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
      {content}
    </View>
  );
}

/** Times from the stored delivery timestamps; distance isn't shown because GPS history isn't kept for every update. */
function TripStats({ delivery }: { delivery: PartnerDelivery }) {
  const { currency } = useSettings();
  const cash = Number(delivery.cashToCollect) > 0;
  const rows = [
    { label: "Trip time", hint: "Store to customer", value: formatDuration(delivery.pickedUpAt, delivery.deliveredAt), earning: false },
    { label: "Total time", hint: "From accepting", value: formatDuration(delivery.acceptedAt, delivery.deliveredAt), earning: false },
    { label: "Cash collected", hint: null, value: cash ? formatMoney(delivery.cashToCollect, currency) : null, earning: false },
    { label: "You earned", hint: null, value: delivery.earning ? formatMoney(delivery.earning, currency) : null, earning: true },
  ].filter((row) => row.value !== null);

  return (
    <View className="gap-2.5">
      {rows.map((row) => (
        <View key={row.label} className="flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-semibold">{row.label}</Text>
            {row.hint && <Text className="text-xs text-muted-foreground">{row.hint}</Text>}
          </View>
          <Text className={cn("text-base font-extrabold", row.earning && "text-primary")}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

function DeliveredSheet({ delivery, onDone }: { delivery: PartnerDelivery; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onDone}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="gap-5 rounded-t-3xl bg-card px-5 pt-6" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="items-center gap-2">
            <View className="size-16 items-center justify-center rounded-full bg-primary">
              <Icon as={Check} size={34} className="text-primary-foreground" />
            </View>
            <Text className="text-2xl font-extrabold">Delivery complete</Text>
            <Text className="text-sm text-muted-foreground">
              {delivery.orderNumber} · {delivery.customer.name}
            </Text>
          </View>
          <View className="rounded-lg bg-muted/60 p-4">
            <TripStats delivery={delivery} />
          </View>
          <Button onPress={onDone} className="h-12 rounded-lg">
            <Text className="text-base font-bold">Done</Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}

function DeliveryBody({ delivery }: { delivery: PartnerDelivery }) {
  const surface = useCardSurface();
  const { currency } = useSettings();
  const step = stepText(delivery);
  const { store, customer } = delivery;
  const cash = Number(delivery.cashToCollect) > 0;
  const headingToStore = delivery.orderStatus === "ASSIGNED";
  const delivered = delivery.orderStatus === "DELIVERED";

  return (
    <ScrollView contentContainerClassName="gap-4 pb-6 pt-1">
      <View className={cn("mx-4 gap-1 rounded-lg p-4", surface)}>
        <Text className="text-xl font-extrabold">{step.title}</Text>
        <Text className="text-sm text-muted-foreground">{step.detail}</Text>
        {delivered && (
          <View className="mt-3 border-t border-border pt-3">
            <TripStats delivery={delivery} />
          </View>
        )}
      </View>

      {mapsAvailable && delivery.allowedActions.length > 0 && <DeliveryMap delivery={delivery} />}

      <View className={cn("mx-4 flex-row items-center gap-3 rounded-lg p-4", cash ? "bg-highlight" : surface)}>
        <Icon as={cash ? Banknote : CreditCard} size={24} className={cash ? "text-highlight-foreground" : "text-primary"} />
        <View className="flex-1">
          <Text className={cn("text-base font-extrabold", cash && "text-highlight-foreground")}>
            {cash ? `Collect ${formatMoney(delivery.cashToCollect, currency)} cash` : "Paid online"}
          </Text>
          <Text className={cn("text-xs", cash ? "text-highlight-foreground" : "text-muted-foreground")}>
            {cash ? "Cash on delivery. Collect it before handing over the order." : "Don't collect any money from the customer."}
          </Text>
        </View>
      </View>

      <Section
        icon={Store}
        title={headingToStore ? "Pick up from" : "Picked up from"}
        actions={headingToStore ? <ContactButtons phone={store.phone} latitude={store.latitude} longitude={store.longitude} /> : null}
      >
        <View className="gap-0.5">
          <Text className="text-base font-bold">{store.name}</Text>
          <Text className="text-sm text-muted-foreground">{[store.addressLine1, store.addressLine2, store.city].filter(Boolean).join(", ")}</Text>
          {store.phone && <Text className="text-xs text-muted-foreground">{formatPhone(store.phone)}</Text>}
          {headingToStore && delivery.pickup && <Text className="mt-1 text-sm font-bold text-primary">{formatPickup(delivery.pickup)}</Text>}
        </View>
      </Section>

      <Section
        icon={MapPin}
        title="Deliver to"
        actions={customer.phone ? <ContactButtons phone={customer.phone} latitude={customer.latitude} longitude={customer.longitude} /> : null}
      >
        <View className="gap-0.5">
          <Text className="text-base font-bold">{customer.name}</Text>
          {customer.addressLine1 ? (
            <>
              <Text className="text-sm text-muted-foreground">
                {[customer.addressLine1, customer.addressLine2, customer.city, customer.postalCode].filter(Boolean).join(", ")}
              </Text>
              {customer.landmark && <Text className="text-sm text-muted-foreground">Landmark: {customer.landmark}</Text>}
            </>
          ) : (
            <Text className="text-sm text-muted-foreground">{customer.city}</Text>
          )}
        </View>
      </Section>

      <View className={cn("mx-4 gap-2 rounded-lg p-4", surface)}>
        <Text className="text-sm font-bold uppercase text-muted-foreground">
          {itemCount(delivery)} items · {delivery.orderNumber}
        </Text>
        {delivery.items.map((item, index) => (
          <Text key={index} className="text-sm">
            <Text className="text-sm font-bold">{item.quantity} × </Text>
            {item.productName}
            {item.variantName ? <Text className="text-sm text-muted-foreground"> · {item.variantName}</Text> : null}
          </Text>
        ))}
        <View className="h-px bg-border" />
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted-foreground">Order total</Text>
          <Text className="text-sm font-bold">{formatMoney(delivery.orderTotal, currency)}</Text>
        </View>
        {delivery.earning && (
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted-foreground">Your earning</Text>
            <Text className="text-sm font-bold text-primary">{formatMoney(delivery.earning, currency)}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

export default function DeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const delivery = useDelivery(id);
  const [justDelivered, setJustDelivered] = useState(false);

  return (
    // Android draws edge-to-edge, so the window no longer shrinks for the keyboard; padding keeps the OTP above it.
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title={delivery.data?.orderNumber ?? "Delivery"} />
      {delivery.data ? (
        <>
          <DeliveryBody delivery={delivery.data} />
          <ActionPanel delivery={delivery.data} onDelivered={() => setJustDelivered(true)} />
          {justDelivered && delivery.data.orderStatus === "DELIVERED" && <DeliveredSheet delivery={delivery.data} onDone={() => router.back()} />}
        </>
      ) : delivery.isPending ? (
        <ActivityIndicator color={colors.primary} className="py-12" />
      ) : (
        <QueryError error={delivery.error} onRetry={() => delivery.refetch()} />
      )}
    </KeyboardAvoidingView>
  );
}
