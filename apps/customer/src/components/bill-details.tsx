import type { ReactNode } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { useCardSurface } from "@/lib/app-theme";
import { formatMoney } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** `taxTotal` is the GST already included in the item prices. */
type Bill = { subtotal: string; deliveryFee: string; discount: string; total: string; taxTotal?: string; amountToFreeDelivery?: string | null };

type BillDetailsProps = {
  bill: Bill;
  /** What the items would cost at MRP; see `mrpTotal`. */
  itemsMrp?: string;
  /** The usual delivery fee, shown struck through when this bill's delivery is free. */
  regularDeliveryFee?: string;
  totalLabel?: string;
  /** Names the discount row. */
  couponCode?: string | null;
  /** Faded while the amounts are being recalculated. */
  stale?: boolean;
  footer?: ReactNode;
};

// Paise keep the display sums free of float rounding.
const toPaise = (amount: string) => Math.round(Number(amount) * 100);
const fromPaise = (paise: number) => (paise / 100).toFixed(2);

/** MRP of the lines, using the selling price where a line has no MRP. Display only. */
export function mrpTotal(lines: { mrp: string | null; unitPrice: string | null; quantity: number }[]) {
  return fromPaise(lines.reduce((sum, line) => sum + toPaise(line.mrp ?? line.unitPrice ?? "0") * line.quantity, 0));
}

function BillRow({ label, value, strong = false, badge }: { label: string; value: ReactNode; strong?: boolean; badge?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="flex-row items-center gap-2">
        <Text className={cn("text-sm", strong ? "text-base font-extrabold" : "text-muted-foreground")}>{label}</Text>
        {badge}
      </View>
      {typeof value === "string" ? <Text className={cn("text-sm font-semibold", strong && "text-base font-extrabold")}>{value}</Text> : value}
    </View>
  );
}

function Struck({ was, now, highlight = false }: { was: string; now: string; highlight?: boolean }) {
  return (
    <View className="flex-row items-baseline gap-1.5">
      <Text className="text-xs text-muted-foreground line-through">{was}</Text>
      <Text className={cn("text-sm font-semibold", highlight && "font-bold text-primary")}>{now}</Text>
    </View>
  );
}

export function BillDetails({ bill, itemsMrp, regularDeliveryFee, totalLabel = "To pay", couponCode, stale = false, footer }: BillDetailsProps) {
  const { currency } = useSettings();
  const surface = useCardSurface();
  const free = toPaise(bill.deliveryFee) === 0;
  const itemSavings = itemsMrp ? Math.max(0, toPaise(itemsMrp) - toPaise(bill.subtotal)) : 0;
  const deliverySavings = free && regularDeliveryFee ? toPaise(regularDeliveryFee) : 0;
  const totalSavings = itemSavings + deliverySavings + toPaise(bill.discount);

  return (
    <View className={cn("mx-4 overflow-hidden rounded-lg", surface, stale && "opacity-60")}>
      <View className="gap-2.5 p-4">
        <Text className="text-base font-bold">Bill details</Text>
        <BillRow
          label="Items total"
          badge={
            itemSavings > 0 ? (
              <View className="rounded bg-primary/10 px-1.5 py-0.5">
                <Text className="text-[10px] font-bold text-primary">Saved {formatMoney(fromPaise(itemSavings), currency)}</Text>
              </View>
            ) : null
          }
          value={
            itemSavings > 0 ? <Struck was={formatMoney(itemsMrp!, currency)} now={formatMoney(bill.subtotal, currency)} /> : formatMoney(bill.subtotal, currency)
          }
        />
        <BillRow
          label="Delivery fee"
          value={
            !free ? (
              formatMoney(bill.deliveryFee, currency)
            ) : deliverySavings > 0 ? (
              <Struck was={formatMoney(regularDeliveryFee!, currency)} now="FREE" highlight />
            ) : (
              <Text className="text-sm font-bold text-primary">FREE</Text>
            )
          }
        />
        {toPaise(bill.discount) > 0 && (
          <BillRow label={couponCode ? `Coupon ${couponCode}` : "Discount"} value={`−${formatMoney(bill.discount, currency)}`} />
        )}
        <View className="h-px bg-border" />
        <BillRow label={totalLabel} value={formatMoney(bill.total, currency)} strong />
        {bill.taxTotal && toPaise(bill.taxTotal) > 0 ? (
          <Text className="-mt-1.5 text-xs text-muted-foreground">Includes {formatMoney(bill.taxTotal, currency)} GST</Text>
        ) : null}
        {bill.amountToFreeDelivery && !free && (
          <Text className="text-xs font-semibold text-primary">Add {formatMoney(bill.amountToFreeDelivery, currency)} more for free delivery</Text>
        )}
        {footer}
      </View>
      {totalSavings > 0 && (
        <View className="flex-row items-start justify-between gap-3 bg-primary/10 px-4 py-3">
          <View className="flex-1">
            <Text className="text-sm font-bold text-primary">Your total savings</Text>
            {deliverySavings > 0 && (
              <Text className="text-xs text-muted-foreground">Includes {formatMoney(fromPaise(deliverySavings), currency)} saved on delivery</Text>
            )}
          </View>
          <Text className="text-sm font-extrabold text-primary">{formatMoney(fromPaise(totalSavings), currency)}</Text>
        </View>
      )}
    </View>
  );
}
