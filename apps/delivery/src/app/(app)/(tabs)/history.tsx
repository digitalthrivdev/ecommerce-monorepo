import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, History } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DeliveryCard } from "@/components/delivery-card";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { MonthPicker } from "@/components/month-picker";
import { QueryError } from "@/components/query-error";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { currentMonth, useDeliveryHistory, useEarnings, type Month, type Period } from "@/lib/delivery";
import { formatMoney, formatMonth } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const PERIODS = [
  { id: "today", label: "Today" },
  { id: "week", label: "7 days" },
  { id: "month", label: "Month" },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

type EarningsSummaryProps = {
  periodId: PeriodId;
  onPeriodChange: (id: PeriodId) => void;
  month: Month;
  onMonthChange: (month: Month) => void;
  period: Period;
};

function EarningsSummary({ periodId, onPeriodChange: setPeriodId, month, onMonthChange: setMonth, period }: EarningsSummaryProps) {
  const surface = useCardSurface();
  const { currency } = useSettings();
  const [picking, setPicking] = useState(false);
  const earnings = useEarnings(period);
  const now = currentMonth();
  const isCurrentMonth = month.year === now.year && month.month === now.month;

  const stepMonth = (by: number) => {
    const date = new Date(month.year, month.month + by, 1);
    setMonth({ year: date.getFullYear(), month: date.getMonth() });
  };

  return (
    <View className={cn("mx-4 mb-1 gap-3 rounded-lg p-4", surface)}>
      <View className="flex-row rounded-lg bg-muted p-1">
        {PERIODS.map((period) => (
          <Pressable
            key={period.id}
            onPress={() => setPeriodId(period.id)}
            className={cn("h-9 flex-1 items-center justify-center rounded-md", periodId === period.id && "bg-card")}
            accessibilityRole="tab"
            accessibilityState={{ selected: periodId === period.id }}
          >
            <Text className={cn("text-sm font-bold", periodId !== period.id && "text-muted-foreground")}>{period.label}</Text>
          </Pressable>
        ))}
      </View>

      {periodId === "month" && (
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => stepMonth(-1)} className="size-10 items-center justify-center rounded-full active:bg-accent" accessibilityLabel="Previous month">
            <Icon as={ChevronLeft} size={20} />
          </Pressable>
          <Pressable onPress={() => setPicking(true)} className="flex-row items-center gap-1.5 rounded-md px-3 py-2 active:bg-accent" accessibilityLabel="Choose a month">
            <Icon as={CalendarDays} size={16} className="text-primary" />
            <Text className="text-base font-bold">{formatMonth(new Date(month.year, month.month, 1))}</Text>
          </Pressable>
          <Pressable
            onPress={() => stepMonth(1)}
            disabled={isCurrentMonth}
            className={cn("size-10 items-center justify-center rounded-full active:bg-accent", isCurrentMonth && "opacity-30")}
            accessibilityLabel="Next month"
          >
            <Icon as={ChevronRight} size={20} />
          </Pressable>
        </View>
      )}

      {earnings.data ? (
        <View className="flex-row">
          <View className="flex-1 gap-0.5">
            <Text className="text-2xl font-extrabold text-primary">{formatMoney(earnings.data.earnings, currency)}</Text>
            <Text className="text-xs text-muted-foreground">Earned</Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-2xl font-extrabold">{earnings.data.deliveries}</Text>
            <Text className="text-xs text-muted-foreground">Deliveries</Text>
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-2xl font-extrabold">{formatMoney(earnings.data.cashCollected, currency)}</Text>
            <Text className="text-xs text-muted-foreground">Cash collected</Text>
          </View>
        </View>
      ) : earnings.isError ? (
        <QueryError error={earnings.error} onRetry={() => earnings.refetch()} />
      ) : (
        <Skeleton className="h-12 w-full rounded-md" />
      )}

      <MonthPicker open={picking} value={month} onSelect={setMonth} onClose={() => setPicking(false)} />
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const queryClient = useQueryClient();
  const [periodId, setPeriodId] = useState<PeriodId>("week");
  const [month, setMonth] = useState<Month>(currentMonth);
  const period: Period = periodId === "month" ? month : periodId;
  const history = useDeliveryHistory(period);
  const [refreshing, setRefreshing] = useState(false);
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  const emptyText =
    periodId === "today"
      ? "No deliveries today yet."
      : periodId === "week"
        ? "No deliveries in the last 7 days."
        : `No deliveries in ${formatMonth(new Date(month.year, month.month, 1))}.`;

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
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
        ListHeaderComponent={
          <View className="gap-4">
            <Text className="px-4 pt-3 text-2xl font-extrabold">History</Text>
            <EarningsSummary periodId={periodId} onPeriodChange={setPeriodId} month={month} onMonthChange={setMonth} period={period} />
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
              <Text className="text-center text-sm text-muted-foreground">{emptyText}</Text>
            </View>
          )
        }
        ListFooterComponent={history.isFetchingNextPage ? <ActivityIndicator color={colors.primary} className="py-4" /> : null}
      />
    </View>
  );
}
