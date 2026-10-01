import { router, useLocalSearchParams } from "expo-router";
import { Banknote, CreditCard, MapPin, Navigation, Phone, Store, type LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
import { formatMoney } from "@/lib/format";
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

function ActionPanel({ delivery }: { delivery: PartnerDelivery }) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { currency } = useSettings();
  const run = useDeliveryAction(delivery.orderId);
  const [otp, setOtp] = useState("");
  const [enteringOtp, setEnteringOtp] = useState(false);
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

  function confirmPickup() {
    Alert.alert("Picked up the order?", `Check you have all ${delivery.items.reduce((sum, item) => sum + item.quantity, 0)} items from ${delivery.store.name}.`, [
      { text: "Not yet", style: "cancel" },
      { text: "Picked up", onPress: () => run.mutate({ action: "pickup" }, { onError: fail("Couldn't mark as picked up") }) },
    ]);
  }

  function submitOtp(value: string) {
    run.mutate(
      { action: "delivered", otp: value },
      {
        onSuccess: (result) => {
          const earning = "earning" in result && result.earning ? ` You earned ${formatMoney(result.earning, currency)}.` : "";
          Alert.alert("Delivery complete", `Great job!${earning}`, [{ text: "Done", onPress: () => router.back() }]);
        },
        onError: () => setOtp(""),
      },
    );
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
      <Button onPress={confirmPickup} disabled={run.isPending} className="h-12 rounded-lg">
        {run.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text className="text-base font-bold">Picked up from store</Text>}
      </Button>
    );
  } else if (actions.includes("start-delivery")) {
    content = (
      <Button onPress={() => run.mutate({ action: "start-delivery" }, { onError: fail("Couldn't start the delivery") })} disabled={run.isPending} className="h-12 rounded-lg">
        {run.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text className="text-base font-bold">Start delivery</Text>}
      </Button>
    );
  } else if (actions.includes("delivered")) {
    content = enteringOtp ? (
      <View className="gap-3">
        <Text className="text-sm font-semibold">Enter the 4-digit OTP from the customer</Text>
        <OtpInput
          value={otp}
          onChange={(value) => {
            setOtp(value);
            if (value.length === OTP_LENGTH) submitOtp(value);
          }}
          length={OTP_LENGTH}
          invalid={run.isError}
          editable={!run.isPending}
        />
        {run.isPending ? (
          <ActivityIndicator color={colors.primary} />
        ) : run.isError ? (
          <Text className="text-sm text-destructive">{otpErrorMessage(run.error)}</Text>
        ) : cash ? (
          <Text className="text-sm font-semibold">Collect {formatMoney(delivery.cashToCollect, currency)} before handing over the order.</Text>
        ) : null}
      </View>
    ) : (
      <Button
        onPress={() => {
          run.reset();
          setEnteringOtp(true);
        }}
        className="h-12 rounded-lg"
      >
        <Text className="text-base font-bold">Enter delivery OTP</Text>
      </Button>
    );
  }

  return (
    <View className="border-t border-border bg-card px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
      {content}
    </View>
  );
}

function DeliveryBody({ delivery }: { delivery: PartnerDelivery }) {
  const surface = useCardSurface();
  const { currency } = useSettings();
  const step = stepText(delivery);
  const { store, customer } = delivery;
  const cash = Number(delivery.cashToCollect) > 0;
  const headingToStore = delivery.orderStatus === "ASSIGNED";

  return (
    <ScrollView contentContainerClassName="gap-4 pb-6 pt-1">
      <View className={cn("mx-4 gap-1 rounded-lg p-4", surface)}>
        <Text className="text-xl font-extrabold">{step.title}</Text>
        <Text className="text-sm text-muted-foreground">{step.detail}</Text>
      </View>

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
          {delivery.items.reduce((sum, item) => sum + item.quantity, 0)} items · {delivery.orderNumber}
        </Text>
        {delivery.items.map((item, index) => (
          <Text key={index} className="text-sm">
            <Text className="text-sm font-bold">{item.quantity} × </Text>
            {item.productName}
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

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title={delivery.data?.orderNumber ?? "Delivery"} />
      {delivery.data ? (
        <>
          <DeliveryBody delivery={delivery.data} />
          <ActionPanel delivery={delivery.data} />
        </>
      ) : delivery.isPending ? (
        <ActivityIndicator color={colors.primary} className="py-12" />
      ) : (
        <QueryError error={delivery.error} onRetry={() => delivery.refetch()} />
      )}
    </KeyboardAvoidingView>
  );
}
