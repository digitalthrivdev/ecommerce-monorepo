import { useQueryClient } from "@tanstack/react-query";
import { History } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DeliveryCard } from "@/components/delivery-card";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { useDeliveryHistory, useEarnings } from "@/lib/delivery";
import { formatMoney } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

function WeekSummary() {
  const surface = useCardSurface();
  const { currency } = useSettings();
  const week = useEarnings("week");

  return (
    <View className={cn("mx-4 mb-1 gap-3 rounded-lg p-4", surface)}>
      <Text className="text-sm font-bold text-muted-foreground">Last 7 days</Text>
      {week.data ? (
        <View className="flex-row">
          <View className="flex-1 gap-0.5">
            <Text className="text-2xl font-extrabold text-primary">{formatMoney(week.data.earnings, currency)}</Text>
            <Text className="text-xs text-muted-foreground">Earned</Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-2xl font-extrabold">{week.data.deliveries}</Text>
            <Text className="text-xs text-muted-foreground">Deliveries</Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-2xl font-extrabold">{formatMoney(week.data.cashCollected, currency)}</Text>
            <Text className="text-xs text-muted-foreground">Cash collected</Text>
          </View>
        </View>
      ) : (
        <Skeleton className="h-12 w-full rounded-md" />
      )}
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const history = useDeliveryHistory();
  const [refreshing, setRefreshing] = useState(false);
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  async function refresh() {
    setRefreshing(true);
    await Promise.all([history.refetch(), queryClient.invalidateQueries({ queryKey: ["earnings"] })]);
    setRefreshing(false);
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <FlatList
        data={items}
        keyExtractor={(delivery) => delivery.orderId}
        renderItem={({ item }) => <DeliveryCard delivery={item} past />}
        contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        onEndReached={() => {
          if (history.hasNextPage && !history.isFetchingNextPage) history.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View className="gap-4">
            <Text className="px-4 pt-3 text-2xl font-extrabold">History</Text>
            <WeekSummary />
          </View>
        }
        ListEmptyComponent={
          history.isPending ? (
            <View className="gap-3 px-4">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-28 w-full rounded-lg" />
              ))}
            </View>
          ) : history.isError ? (
            <QueryError error={history.error} onRetry={() => history.refetch()} />
          ) : (
            <View className="items-center gap-3 px-8 py-10">
              <Icon as={History} size={34} className="text-muted-foreground" />
              <Text className="text-center text-sm text-muted-foreground">Completed deliveries will show up here.</Text>
            </View>
          )
        }
        ListFooterComponent={history.isFetchingNextPage ? <ActivityIndicator color={colors.primary} className="py-4" /> : null}
      />
    </View>
  );
}
