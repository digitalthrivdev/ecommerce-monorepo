import { router, useLocalSearchParams } from "expo-router";
import { CircleCheck, FlaskConical } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { useAppTheme } from "@/lib/app-theme";
import { formatMoney, formatTime } from "@/lib/format";
import { useOrder, usePayOnline } from "@/lib/orders";
import { useSettings } from "@/lib/settings";
import type { OrderDetail } from "@/lib/types";

function PaymentPanel({ order }: { order: OrderDetail }) {
  const { colors } = useAppTheme();
  const { currency } = useSettings();
  const pay = usePayOnline(order.id);
  const paid = order.payment?.status === "PAID";

  if (order.status !== "PENDING_PAYMENT") {
    return (
      <View className="items-center gap-3 px-8 py-12">
        {paid && <Icon as={CircleCheck} size={48} className="text-primary" />}
        <Text className="text-center text-lg font-extrabold">{paid ? "Payment received" : "This order isn't waiting for payment"}</Text>
        <Button onPress={() => router.back()} className="mt-2 h-11 rounded-lg px-8">
          <Text className="font-semibold">View order</Text>
        </Button>
      </View>
    );
  }

  return (
    <View className="flex-1 justify-between px-4 pb-4">
      <View className="items-center gap-1 py-10">
        <Text className="text-sm text-muted-foreground">Amount to pay</Text>
        <Text className="text-4xl font-extrabold">{formatMoney(order.total, currency)}</Text>
        <Text className="text-xs text-muted-foreground">Order {order.orderNumber}</Text>
        {order.paymentExpiresAt && <Text className="pt-2 text-sm font-semibold text-destructive">Pay by {formatTime(order.paymentExpiresAt)} or the order is cancelled</Text>}
      </View>

      <View className="gap-3">
        <View className="flex-row gap-2 rounded-lg bg-muted p-3">
          <Icon as={FlaskConical} size={18} className="text-muted-foreground" />
          <Text className="flex-1 text-xs text-muted-foreground">Test payment: this build uses a simulated payment provider. No money is charged.</Text>
        </View>
        {pay.error ? <Text className="text-center text-sm text-destructive">{errorMessage(pay.error)}</Text> : null}
        <Button disabled={pay.isPending} onPress={() => pay.mutate("success", { onSuccess: () => router.back() })} className="h-12 rounded-lg">
          {pay.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text className="text-base font-bold">Pay {formatMoney(order.total, currency)}</Text>}
        </Button>
        <Button variant="outline" disabled={pay.isPending} onPress={() => pay.mutate("failure")} className="h-12 rounded-lg">
          <Text className="font-semibold">Simulate a failed payment</Text>
        </Button>
      </View>
    </View>
  );
}

export default function PayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const order = useOrder(id);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <FocusStatusBar />
      <ScreenHeader title="Payment" close />
      {order.data ? (
        <PaymentPanel order={order.data} />
      ) : order.isPending ? (
        <ActivityIndicator color={colors.primary} className="py-12" />
      ) : (
        <QueryError error={order.error} onRetry={() => order.refetch()} />
      )}
    </View>
  );
}
