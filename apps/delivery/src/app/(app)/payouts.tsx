import { HandCoins } from "lucide-react-native";
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
import { usePayouts } from "@/lib/delivery";
import { formatDate, formatMoney } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import type { EarningsSummary, PayoutMethod, RiderPayout } from "@/lib/types";
import { cn } from "@/lib/utils";

const METHOD_LABELS: Record<PayoutMethod, string> = { CASH: "Cash", UPI: "UPI", BANK_TRANSFER: "Bank transfer", OTHER: "Other" };

function Summary({ earnings }: { earnings: EarningsSummary }) {
  const surface = useCardSurface();
  const { currency } = earnings;
  return (
    <View className={cn("mx-4 gap-3 rounded-lg p-4", surface)}>
      <View className="gap-0.5">
        <Text className="text-sm font-bold text-muted-foreground">Still to be paid</Text>
        <Text className="text-3xl font-extrabold text-primary">{formatMoney(earnings.unpaid, currency)}</Text>
        <Text className="text-xs text-muted-foreground">Delivery earnings since {formatDate(earnings.since)}</Text>
      </View>
      <View className="flex-row border-t border-border pt-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-bold">{formatMoney(earnings.earned, currency)}</Text>
          <Text className="text-xs text-muted-foreground">Earned</Text>
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-bold">{formatMoney(earnings.paid, currency)}</Text>
          <Text className="text-xs text-muted-foreground">Paid to you</Text>
        </View>
      </View>
    </View>
  );
}

function PayoutRow({ payout, currency }: { payout: RiderPayout; currency: string }) {
  const surface = useCardSurface();
  return (
    <View className={cn("mx-4 gap-1 rounded-lg p-4", surface)}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className={cn("text-base font-extrabold", payout.voided && "text-muted-foreground line-through")}>{formatMoney(payout.amount, currency)}</Text>
        <Text className="text-xs text-muted-foreground">{formatDate(payout.paidAt)}</Text>
      </View>
      <Text className="text-sm text-muted-foreground">{[METHOD_LABELS[payout.method], payout.note].filter(Boolean).join(" · ")}</Text>
      {payout.voided && (
        <Text className="text-sm font-semibold text-destructive">
          Voided{payout.voided.reason ? `: ${payout.voided.reason}` : ""}. This amount counts as unpaid again.
        </Text>
      )}
    </View>
  );
}

export default function PayoutsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const payouts = usePayouts();
  const [refreshing, setRefreshing] = useState(false);
  const pages = payouts.data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const earnings = pages[0]?.earnings;
  const { currency } = useSettings();

  async function refresh() {
    setRefreshing(true);
    await payouts.refetch();
    setRefreshing(false);
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title="Payouts" />
      <FlatList
        data={items}
        keyExtractor={(payout) => payout.id}
        renderItem={({ item }) => <PayoutRow payout={item} currency={currency} />}
        contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        onEndReached={() => {
          if (payouts.hasNextPage && !payouts.isFetchingNextPage) payouts.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        initialNumToRender={10}
        windowSize={7}
        ListHeaderComponent={
          <View className="gap-4 pt-2">
            {earnings ? <Summary earnings={earnings} /> : payouts.isPending ? <Skeleton className="mx-4 h-36 rounded-lg" /> : null}
            {earnings && <Text className="px-4 text-sm font-bold text-muted-foreground">Payments</Text>}
          </View>
        }
        ListEmptyComponent={
          payouts.isPending ? null : payouts.isError ? (
            <QueryError error={payouts.error} onRetry={() => payouts.refetch()} />
          ) : (
            <View className="items-center gap-3 px-8 py-10">
              <Icon as={HandCoins} size={34} className="text-muted-foreground" />
              <Text className="text-center text-sm text-muted-foreground">No payments yet. When your store pays your earnings, they show up here.</Text>
            </View>
          )
        }
        ListFooterComponent={payouts.isFetchingNextPage ? <ActivityIndicator color={colors.primary} className="py-4" /> : null}
      />
    </View>
  );
}
