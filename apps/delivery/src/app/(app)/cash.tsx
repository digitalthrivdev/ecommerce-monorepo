import { Banknote } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { useCash, useCashDeposits } from "@/lib/delivery";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import type { CashDeposit } from "@/lib/types";
import { cn } from "@/lib/utils";

function Balance() {
  const surface = useCardSurface();
  const cash = useCash();

  if (cash.isError) return <QueryError error={cash.error} onRetry={() => cash.refetch()} />;
  if (!cash.data) return <Skeleton className="mx-4 h-36 rounded-lg" />;

  const { inHand, collected, deposited, limit, limitReached, currency } = cash.data;
  return (
    <View className={cn("mx-4 gap-3 rounded-lg p-4", surface)}>
      <View className="gap-0.5">
        <Text className="text-sm font-bold text-muted-foreground">Cash in hand</Text>
        <Text className={cn("text-3xl font-extrabold", limitReached && "text-destructive")}>{formatMoney(inHand, currency)}</Text>
        {limit && (
          <Text className="text-xs text-muted-foreground">
            {limitReached ? "Limit reached. Deposit cash at the store to get new orders." : `You can hold up to ${formatMoney(limit, currency)}.`}
          </Text>
        )}
      </View>
      <View className="flex-row border-t border-border pt-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-bold">{formatMoney(collected, currency)}</Text>
          <Text className="text-xs text-muted-foreground">Collected on delivery</Text>
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-bold">{formatMoney(deposited, currency)}</Text>
          <Text className="text-xs text-muted-foreground">Deposited</Text>
        </View>
      </View>
    </View>
  );
}

function DepositRow({ deposit, currency }: { deposit: CashDeposit; currency: string }) {
  const surface = useCardSurface();
  const where = [deposit.store?.name, deposit.recordedBy].filter(Boolean).join(" · ");

  return (
    <View className={cn("mx-4 gap-1 rounded-lg p-4", surface)}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className={cn("text-base font-extrabold", deposit.voided && "text-muted-foreground line-through")}>
          {formatMoney(deposit.amount, currency)}
        </Text>
        <Text className="text-xs text-muted-foreground">{formatDateTime(deposit.createdAt)}</Text>
      </View>
      {where ? <Text className="text-sm text-muted-foreground">Received by {where}</Text> : null}
      {deposit.note ? <Text className="text-sm">{deposit.note}</Text> : null}
      {deposit.voided && (
        <Text className="text-sm font-semibold text-destructive">
          Voided{deposit.voided.reason ? `: ${deposit.voided.reason}` : ""}. This amount is back in your cash in hand.
        </Text>
      )}
    </View>
  );
}

export default function CashScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const cash = useCash();
  const deposits = useCashDeposits();
  const [refreshing, setRefreshing] = useState(false);
  const items = deposits.data?.pages.flatMap((page) => page.items) ?? [];
  const { currency } = useSettings();

  async function refresh() {
    setRefreshing(true);
    await Promise.all([cash.refetch(), deposits.refetch()]);
    setRefreshing(false);
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title="Cash in hand" />
      <FlatList
        data={items}
        keyExtractor={(deposit) => deposit.id}
        renderItem={({ item }) => <DepositRow deposit={item} currency={currency} />}
        contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        onEndReached={() => {
          if (deposits.hasNextPage && !deposits.isFetchingNextPage) deposits.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        initialNumToRender={10}
        windowSize={7}
        ListHeaderComponent={
          <View className="gap-4 pt-2">
            <Balance />
            <Text className="px-4 text-sm font-bold text-muted-foreground">Deposits</Text>
          </View>
        }
        ListEmptyComponent={
          deposits.isPending ? (
            <View className="gap-3 px-4">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-20 w-full rounded-lg" />
              ))}
            </View>
          ) : deposits.isError ? (
            <QueryError error={deposits.error} onRetry={() => deposits.refetch()} />
          ) : (
            <View className="items-center gap-3 px-8 py-10">
              <Icon as={Banknote} size={34} className="text-muted-foreground" />
              <Text className="text-center text-sm text-muted-foreground">No deposits yet. Hand over cash at the store and they&apos;ll record it here.</Text>
            </View>
          )
        }
        ListFooterComponent={deposits.isFetchingNextPage ? <ActivityIndicator color={colors.primary} className="py-4" /> : null}
      />
    </View>
  );
}
