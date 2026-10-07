import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { router } from "expo-router";
import { BellRing, ChevronLeft, ChevronRight, Store } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, AppState, Easing, Modal, PanResponder, Vibration, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { useAppTheme } from "@/lib/app-theme";
import { useActiveDeliveries, useDeliveryAction, usePartner } from "@/lib/delivery";
import { formatMoney, formatPickup } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import type { PartnerDelivery } from "@/lib/types";

const RINGTONE = require("../../assets/sounds/new_delivery.wav");
const VIBRATION = [0, 600, 400, 600, 1400];
const KNOB_SIZE = 60;
/** How far, as a share of the way to either end, the knob has to be dragged to answer. */
const ANSWER_AT = 0.7;

/** Rings and vibrates like a phone call while `enabled` and the app is in the foreground. */
function useRinging(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let removed = false;
    const player = createAudioPlayer(RINGTONE);
    player.loop = true;

    const start = () => {
      if (removed) return;
      player.play();
      Vibration.vibrate(VIBRATION, true);
    };
    const stop = () => {
      player.pause();
      Vibration.cancel();
    };

    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "duckOthers" })
      .catch(() => {})
      .finally(() => {
        if (AppState.currentState === "active") start();
      });
    // In the background the push notification rings instead.
    const subscription = AppState.addEventListener("change", (state) => (state === "active" ? start() : stop()));

    return () => {
      removed = true;
      subscription.remove();
      stop();
      player.remove();
    };
  }, [enabled]);
}

type SwipeProps = { onAccept: () => void; onDecline: () => void; foreground: string; knobColor: string };

/** A knob in the middle of a track: drag it right to accept or left to decline. */
function SwipeToAnswer({ onAccept, onDecline, foreground, knobColor }: SwipeProps) {
  const [offset] = useState(() => new Animated.Value(0));
  const [trackWidth, setTrackWidth] = useState(0);
  const limit = useRef(0);
  const handlers = useRef({ onAccept, onDecline });

  useEffect(() => {
    handlers.current = { onAccept, onDecline };
  }, [onAccept, onDecline]);

  // eslint-disable-next-line react-hooks/refs -- the refs are read in gesture callbacks, not during render
  const [responder] = useState(() => {
    const settle = (toValue: number) => Animated.spring(offset, { toValue, useNativeDriver: true, bounciness: 0 }).start();
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gesture) => offset.setValue(Math.max(-limit.current, Math.min(limit.current, gesture.dx))),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx >= limit.current * ANSWER_AT) {
          settle(limit.current);
          handlers.current.onAccept();
        } else if (gesture.dx <= -limit.current * ANSWER_AT) {
          settle(-limit.current);
          handlers.current.onDecline();
        } else {
          settle(0);
        }
      },
      onPanResponderTerminate: () => settle(0),
    });
  });

  const knobLeft = Math.max(0, (trackWidth - KNOB_SIZE) / 2);

  return (
    <View
      onLayout={({ nativeEvent }) => {
        setTrackWidth(nativeEvent.layout.width);
        limit.current = Math.max(0, (nativeEvent.layout.width - KNOB_SIZE) / 2 - 6);
      }}
      className="h-[72px] flex-row items-center justify-between rounded-full bg-black/20 px-5"
    >
      <View className="flex-row items-center gap-1">
        <ChevronLeft size={18} color={foreground} />
        <Text style={{ color: foreground }} className="text-sm font-bold">
          Decline
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Text style={{ color: foreground }} className="text-sm font-bold">
          Accept
        </Text>
        <ChevronRight size={18} color={foreground} />
      </View>
      <Animated.View
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Swipe right to accept, left to decline"
        accessibilityActions={[
          { name: "increment", label: "Accept" },
          { name: "decrement", label: "Decline" },
        ]}
        onAccessibilityAction={({ nativeEvent }) => (nativeEvent.actionName === "increment" ? onAccept() : onDecline())}
        style={{ position: "absolute", left: knobLeft, width: KNOB_SIZE, height: KNOB_SIZE, transform: [{ translateX: offset }] }}
        className="items-center justify-center rounded-full bg-white shadow-lg"
      >
        <BellRing size={26} color={knobColor} />
      </Animated.View>
    </View>
  );
}

function IncomingSheet({ delivery }: { delivery: PartnerDelivery }) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { currency } = useSettings();
  const run = useDeliveryAction(delivery.orderId);
  const [attempt, setAttempt] = useState(0);
  const [pulse] = useState(() => new Animated.Value(0));
  const cash = Number(delivery.cashToCollect) > 0;
  const itemCount = delivery.items.reduce((sum, item) => sum + item.quantity, 0);
  const answered = run.isPending || run.isSuccess;

  useRinging(!answered);

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const failed = (title: string) => (error: unknown) => {
    Alert.alert(title, errorMessage(error));
    setAttempt((value) => value + 1);
  };

  const accept = () =>
    run.mutate(
      { action: "accept" },
      { onSuccess: () => router.navigate({ pathname: "/delivery/[id]", params: { id: delivery.orderId } }), onError: failed("Couldn't accept") },
    );
  const decline = () => run.mutate({ action: "decline" }, { onError: failed("Couldn't decline") });

  if (run.isSuccess) return null;

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
      <View className="flex-1 justify-end bg-black/50">
        <View style={{ backgroundColor: colors.primary, paddingBottom: insets.bottom + 20 }} className="gap-5 rounded-t-3xl px-5 pt-6">
          <View className="flex-row items-center gap-4">
            <View className="size-14 items-center justify-center">
              <Animated.View
                style={{
                  position: "absolute",
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: colors.onPrimary,
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
                }}
              />
              <View style={{ backgroundColor: colors.onPrimary }} className="size-14 items-center justify-center rounded-full">
                <BellRing size={26} color={colors.primary} />
              </View>
            </View>
            <View className="flex-1">
              <Text style={{ color: colors.onPrimary }} className="text-xs font-bold uppercase tracking-wider opacity-80">
                New delivery
              </Text>
              <Text style={{ color: colors.onPrimary }} className="text-2xl font-extrabold">
                {itemCount} {itemCount === 1 ? "item" : "items"} · {delivery.orderNumber}
              </Text>
            </View>
          </View>

          <View className="gap-3 rounded-2xl bg-black/15 p-4">
            <View className="flex-row gap-3">
              <Store size={18} color={colors.onPrimary} />
              <View className="flex-1">
                <Text style={{ color: colors.onPrimary }} className="text-base font-bold">
                  Pick up from {delivery.store.name}
                </Text>
                <Text style={{ color: colors.onPrimary }} className="text-sm opacity-80" numberOfLines={2}>
                  {[delivery.store.addressLine1, delivery.store.addressLine2, delivery.store.city].filter(Boolean).join(", ")}
                </Text>
                {delivery.pickup && (
                  <Text style={{ color: colors.onPrimary }} className="mt-1 text-sm font-bold">
                    {formatPickup(delivery.pickup)}
                  </Text>
                )}
              </View>
            </View>
            <Text style={{ color: colors.onPrimary }} className="text-sm font-semibold">
              Deliver in {delivery.customer.city} · {cash ? `Collect ${formatMoney(delivery.cashToCollect, currency)} cash` : "Paid online"}
              {delivery.earning ? ` · You earn ${formatMoney(delivery.earning, currency)}` : ""}
            </Text>
          </View>

          {answered ? (
            <View className="h-[72px] items-center justify-center">
              <ActivityIndicator color={colors.onPrimary} />
            </View>
          ) : (
            <SwipeToAnswer key={attempt} onAccept={accept} onDecline={decline} foreground={colors.onPrimary} knobColor={colors.primary} />
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Rings over every screen while a delivery is waiting for the partner to accept or decline it. */
export function IncomingDelivery() {
  const partner = usePartner();
  const working = partner.data ? partner.data.status !== "OFFLINE" : false;
  const deliveries = useActiveDeliveries({ poll: working });
  const incoming = deliveries.data?.find((delivery) => delivery.allowedActions.includes("accept"));
  return incoming ? <IncomingSheet key={incoming.orderId} delivery={incoming} /> : null;
}
