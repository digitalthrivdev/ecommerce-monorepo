import { useQueryClient } from "@tanstack/react-query";
import { MapPinOff, Power, Radar, UserX, type LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark } from "@/components/brand-mark";
import { DeliveryCard } from "@/components/delivery-card";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ApiError, errorMessage } from "@/lib/api";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { useActiveDeliveries, useEarnings, usePartner, useSetPartnerStatus } from "@/lib/delivery";
import { formatMoney } from "@/lib/format";
import { useLocationSharing } from "@/lib/location-sharing";
import { useSession } from "@/lib/session";
import { useSettings } from "@/lib/settings";
import type { PartnerProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

function StatusToggle({ partner }: { partner: PartnerProfile }) {
  const { colors, neutral } = useAppTheme();
  const setStatus = useSetPartnerStatus();
  const busy = partner.status === "BUSY";
  const online = partner.status !== "OFFLINE";

  function toggle(next: boolean) {
    setStatus.mutate(next ? "ONLINE" : "OFFLINE", { onError: (error) => Alert.alert("Couldn't change status", errorMessage(error)) });
  }

  return (
    <View className="flex-row items-center gap-2 rounded-full bg-card py-1 pl-3 pr-1">
      <Text className={cn("text-sm font-bold", online ? "text-primary" : "text-muted-foreground")}>{busy ? "On delivery" : online ? "Online" : "Offline"}</Text>
      {setStatus.isPending ? (
        <ActivityIndicator color={colors.primary} className="mx-3" />
      ) : (
        <Switch
          value={online}
          onValueChange={toggle}
          disabled={busy}
          trackColor={{ false: neutral.border, true: colors.primary }}
          thumbColor="#FFFFFF"
          accessibilityLabel={online ? "Go offline" : "Go online"}
        />
      )}
    </View>
  );
}

function TodaySummary() {
  const surface = useCardSurface();
  const { currency } = useSettings();
  const today = useEarnings("today");
  const stats = [
    { label: "Deliveries", value: today.data ? String(today.data.deliveries) : "–" },
    { label: "Earned", value: today.data ? formatMoney(today.data.earnings, currency) : "–" },
    { label: "Cash collected", value: today.data ? formatMoney(today.data.cashCollected, currency) : "–" },
  ];

  return (
    <View className={cn("mx-4 gap-3 rounded-lg p-4", surface)}>
      <Text className="text-sm font-bold text-muted-foreground">Today</Text>
      <View className="flex-row">
        {stats.map((stat) => (
          <View key={stat.label} className="flex-1 gap-0.5">
            <Text className="text-lg font-extrabold">{stat.value}</Text>
            <Text className="text-xs text-muted-foreground">{stat.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function EmptyState({ icon, title, detail, action }: { icon: LucideIcon; title: string; detail: string; action?: ReactNode }) {
  return (
    <View className="items-center gap-3 px-8 py-10">
      <View className="size-20 items-center justify-center rounded-full bg-muted">
        <Icon as={icon} size={34} className="text-muted-foreground" />
      </View>
      <Text className="text-center text-lg font-extrabold">{title}</Text>
      <Text className="text-center text-sm text-muted-foreground">{detail}</Text>
      {action}
    </View>
  );
}

function InactiveAccount() {
  const { signOut } = useSession();
  return (
    <EmptyState
      icon={UserX}
      title="Your account isn't active"
      detail="Ask your store admin to activate your delivery partner account, then log in again."
      action={
        <Button variant="outline" onPress={() => void signOut()} className="mt-2 h-11 rounded-lg px-6">
          <Text className="font-semibold">Log out</Text>
        </Button>
      }
    />
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const partner = usePartner();
  const setStatus = useSetPartnerStatus();
  const working = partner.data ? partner.data.status !== "OFFLINE" : false;
  const deliveries = useActiveDeliveries({ poll: working });
  const locationGranted = useLocationSharing(working);
  const [refreshing, setRefreshing] = useState(false);
  const inactive = partner.error instanceof ApiError && partner.error.code === "PARTNER_INACTIVE";

  async function refresh() {
    setRefreshing(true);
    await Promise.all(["partner", "deliveries", "earnings"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    setRefreshing(false);
  }

  const items = deliveries.data ?? [];

  return (
    <View className="flex-1 bg-highlight" style={{ paddingTop: insets.top }}>
      <FocusStatusBar onHighlight />
      <View className="flex-row items-center justify-between gap-3 px-4 pb-4 pt-2">
        <View className="flex-1">
          <BrandMark textClassName="text-highlight-foreground text-sm" />
          <Text className="text-2xl font-extrabold text-highlight-foreground" numberOfLines={1}>
            Hi{partner.data?.name ? `, ${partner.data.name.split(" ")[0]}` : ""}
          </Text>
        </View>
        {partner.data && <StatusToggle partner={partner.data} />}
      </View>

      <ScrollView
        className="bg-background"
        contentContainerClassName="gap-4 pb-8 pt-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      >
        {partner.isPending ? (
          <ActivityIndicator color={colors.primary} className="py-12" />
        ) : inactive ? (
          <InactiveAccount />
        ) : partner.isError ? (
          <QueryError error={partner.error} onRetry={() => partner.refetch()} />
        ) : (
          <>
            {working && locationGranted === false && (
              <Pressable onPress={() => Linking.openSettings()} className="mx-4 flex-row items-center gap-3 rounded-lg bg-destructive/10 p-3 active:opacity-80">
                <Icon as={MapPinOff} size={20} className="text-destructive" />
                <Text className="flex-1 text-sm text-foreground">Location is off. Allow location access so the store can see where you are.</Text>
                <Text className="text-sm font-bold text-destructive">Settings</Text>
              </Pressable>
            )}

            {!working ? (
              <EmptyState
                icon={Power}
                title="You're offline"
                detail="Go online to start receiving delivery orders."
                action={
                  <Button
                    onPress={() => setStatus.mutate("ONLINE", { onError: (error) => Alert.alert("Couldn't go online", errorMessage(error)) })}
                    disabled={setStatus.isPending}
                    className="mt-2 h-12 rounded-lg px-8"
                  >
                    <Text className="text-base font-bold">Go online</Text>
                  </Button>
                }
              />
            ) : deliveries.isPending ? (
              <ActivityIndicator color={colors.primary} className="py-12" />
            ) : deliveries.isError ? (
              <QueryError error={deliveries.error} onRetry={() => deliveries.refetch()} />
            ) : items.length === 0 ? (
              <EmptyState icon={Radar} title="Waiting for orders" detail="Stay online. New deliveries assigned to you show up here automatically." />
            ) : (
              items.map((delivery) => <DeliveryCard key={delivery.orderId} delivery={delivery} />)
            )}

            <TodaySummary />
          </>
        )}
      </ScrollView>
    </View>
  );
}
