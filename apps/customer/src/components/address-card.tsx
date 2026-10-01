import { Briefcase, House, MapPin, type LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { addressCoordinates, addressLabel, addressSummary } from "@/lib/addresses";
import { useCardSurface } from "@/lib/app-theme";
import { formatPhone } from "@/lib/phone";
import type { Address } from "@/lib/types";
import { cn } from "@/lib/utils";

const LABEL_ICONS: Record<string, LucideIcon> = { home: House, work: Briefcase };

type AddressCardProps = { address: Address; selected?: boolean; onPress?: () => void; actions?: ReactNode };

export function AddressCard({ address, selected = false, onPress, actions }: AddressCardProps) {
  const surface = useCardSurface();
  const icon = LABEL_ICONS[address.label?.toLowerCase() ?? ""] ?? MapPin;
  const missingLocation = addressCoordinates(address) === null;

  return (
    <Pressable onPress={onPress} disabled={!onPress} className={cn("flex-row gap-3 rounded-lg p-4 active:opacity-80", surface, selected && "border-2 border-primary")}>
      <View className="size-9 items-center justify-center rounded-md bg-muted">
        <Icon as={icon} size={18} className={selected ? "text-primary" : undefined} />
      </View>
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text className="text-[15px] font-bold">{addressLabel(address)}</Text>
          {address.isDefault && (
            <View className="rounded-full bg-muted px-2 py-0.5">
              <Text className="text-[10px] font-semibold text-muted-foreground">DEFAULT</Text>
            </View>
          )}
          {selected && <Text className="text-xs font-semibold text-primary">Delivering here</Text>}
        </View>
        <Text className="text-sm text-muted-foreground" numberOfLines={2}>
          {addressSummary(address)}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {address.name} · {formatPhone(address.phone)}
        </Text>
        {missingLocation && <Text className="text-xs font-semibold text-destructive">Location missing. Edit this address to add it.</Text>}
      </View>
      {actions}
    </Pressable>
  );
}
