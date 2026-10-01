import { router } from "expo-router";
import { ChevronRight, Package } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { formatDateTime, formatMoney } from "@/lib/format";
import { ORDER_STATUS_TEXT, useOrders } from "@/lib/orders";
import { useSettings } from "@/lib/settings";
import type { OrderStatus, OrderSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

function statusTone(status: OrderStatus) {
  if (status === "CANCELLED") return { box: "bg-destructive/10", text: "text-destructive" };
  if (status === "DELIVERED") return { box: "bg-muted", text: "text-muted-foreground" };
  return { box: "bg-primary/10", text: "text-primary" };
}

function OrderRow({ order, currency }: { order: OrderSummary; currency: string }) {
  const surface = useCardSurface();
  const tone = statusTone(order.status);

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/order/[id]", params: { id: order.id } })}
      className={cn("mx-4 flex-row items-center gap-3 rounded-lg p-4 active:opacity-80", surface)}
    >
      <View className="flex-1 gap-1.5">
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-[15px] font-bold" numberOfLines={1}>
            {order.store.name}
          </Text>
          <View className={cn("rounded-full px-2 py-0.5", tone.box)}>
            <Text className={cn("text-[11px] font-bold", tone.text)}>{ORDER_STATUS_TEXT[order.status].title}</Text>
          </View>
        </View>
        <Text className="text-xs text-muted-foreground">
          {order.itemCount} {order.itemCount === 1 ? "item" : "items"} · {formatDateTime(order.createdAt)}
        </Text>
        <Text className="text-sm font-extrabold">{formatMoney(order.total, currency)}</Text>
      </View>
      <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
    </Pressable>
  );
}

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { currency } = useSettings();
  const orders = useOrders();
  const [refreshing, setRefreshing] = useState(false);
  const items = orders.data?.pages.flatMap((page) => page.items) ?? [];

  async function refresh() {
    setRefreshing(true);
    await orders.refetch();
    setRefreshing(false);
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title="Your orders" />
      <FlatList
        data={items}
        keyExtractor={(order) => order.id}
        renderItem={({ item }) => <OrderRow order={item} currency={currency} />}
        contentContainerStyle={{ gap: 12, paddingTop: 4, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        onEndReached={() => {
          if (orders.hasNextPage && !orders.isFetchingNextPage) orders.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          orders.isPending ? (
            <View className="gap-3 px-4">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-lg" />
              ))}
            </View>
          ) : orders.isError ? (
            <QueryError error={orders.error} onRetry={() => orders.refetch()} />
          ) : (
            <View className="flex-1 items-center justify-center gap-3 px-8 pb-16">
              <View className="size-20 items-center justify-center rounded-full bg-muted">
                <Icon as={Package} size={34} className="text-muted-foreground" />
              </View>
              <Text className="text-center text-lg font-extrabold">No orders yet</Text>
              <Text className="text-center text-sm text-muted-foreground">Your orders will show up here.</Text>
              <Button onPress={() => router.navigate("/")} className="mt-1 h-11 rounded-lg px-6">
                <Text className="font-semibold">Start shopping</Text>
              </Button>
            </View>
          )
        }
        ListFooterComponent={orders.isFetchingNextPage ? <ActivityIndicator color={colors.primary} className="py-4" /> : null}
      />
    </View>
  );
}
