import { router } from "expo-router";
import { ChevronRight, MapPin, Store } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCardSurface } from "@/lib/app-theme";
import { stepText } from "@/lib/delivery";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import type { PartnerDelivery } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Summary of one delivery; `past` shows the outcome and earning instead of the next step. */
export function DeliveryCard({ delivery, past = false }: { delivery: PartnerDelivery; past?: boolean }) {
  const { currency } = useSettings();
  const surface = useCardSurface();
  const isNew = delivery.allowedActions.includes("accept");
  const cash = Number(delivery.cashToCollect) > 0;
  const step = stepText(delivery);
  const finishedAt = delivery.deliveredAt ?? delivery.assignedAt;

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/delivery/[id]", params: { id: delivery.orderId } })}
      className={cn("mx-4 gap-3 rounded-lg p-4 active:opacity-80", surface, isNew && "border-2 border-primary")}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1">
          <Text className={cn("text-base font-extrabold", isNew && "text-primary")}>{past ? (delivery.orderStatus === "DELIVERED" ? "Delivered" : "Cancelled") : step.title}</Text>
          <Text className="text-xs text-muted-foreground">
            {delivery.orderNumber}
            {past && finishedAt ? ` · ${formatDateTime(finishedAt)}` : ""}
          </Text>
        </View>
        {past ? (
          delivery.earning && <Text className="text-base font-extrabold text-primary">+{formatMoney(delivery.earning, currency)}</Text>
        ) : (
          <View className={cn("rounded-full px-2.5 py-1", cash ? "bg-highlight" : "bg-muted")}>
            <Text className={cn("text-xs font-bold", cash ? "text-highlight-foreground" : "text-muted-foreground")}>
              {cash ? `Collect ${formatMoney(delivery.cashToCollect, currency)}` : "Prepaid"}
            </Text>
          </View>
        )}
      </View>

      <View className="gap-2">
        <View className="flex-row items-center gap-2">
          <Icon as={Store} size={16} className="text-muted-foreground" />
          <Text className="flex-1 text-sm" numberOfLines={1}>
            {delivery.store.name}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Icon as={MapPin} size={16} className="text-muted-foreground" />
          <Text className="flex-1 text-sm" numberOfLines={1}>
            {delivery.customer.name}
            {delivery.customer.addressLine1 ? ` · ${delivery.customer.addressLine1}` : ` · ${delivery.customer.city}`}
          </Text>
          <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
        </View>
      </View>
    </Pressable>
  );
}
