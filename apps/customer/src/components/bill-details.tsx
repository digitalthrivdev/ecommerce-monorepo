import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { useCardSurface } from "@/lib/app-theme";
import { formatMoney } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

type Bill = { subtotal: string; deliveryFee: string; discount: string; total: string; amountToFreeDelivery?: string | null };

type BillDetailsProps = {
  bill: Bill;
  totalLabel?: string;
  /** Faded while the amounts are being recalculated. */
  stale?: boolean;
  footer?: ReactNode;
};

function BillRow({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className={cn("text-sm", strong ? "text-base font-extrabold" : "text-muted-foreground")}>{label}</Text>
      {typeof value === "string" ? <Text className={cn("text-sm font-semibold", strong && "text-base font-extrabold")}>{value}</Text> : value}
    </View>
  );
}

export function BillDetails({ bill, totalLabel = "To pay", stale = false, footer }: BillDetailsProps) {
  const { currency } = useSettings();
  const surface = useCardSurface();
  const free = Number(bill.deliveryFee) === 0;

  return (
    <View className={cn("mx-4 gap-2.5 rounded-lg p-4", surface, stale && "opacity-60")}>
      <Text className="text-base font-bold">Bill details</Text>
      <BillRow label="Item total" value={formatMoney(bill.subtotal, currency)} />
      <BillRow label="Delivery fee" value={free ? <Text className="text-sm font-bold text-primary">FREE</Text> : formatMoney(bill.deliveryFee, currency)} />
      {Number(bill.discount) > 0 && <BillRow label="Discount" value={`−${formatMoney(bill.discount, currency)}`} />}
      <View className="h-px bg-border" />
      <BillRow label={totalLabel} value={formatMoney(bill.total, currency)} strong />
      {bill.amountToFreeDelivery && !free && (
        <Text className="text-xs font-semibold text-primary">Add {formatMoney(bill.amountToFreeDelivery, currency)} more for free delivery</Text>
      )}
      {footer}
    </View>
  );
}
