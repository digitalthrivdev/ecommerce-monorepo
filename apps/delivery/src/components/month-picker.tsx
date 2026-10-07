import { ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { currentMonth, type Month } from "@/lib/delivery";
import { cn } from "@/lib/utils";

const MONTHS = Array.from({ length: 12 }, (_, month) => new Intl.DateTimeFormat("en-IN", { month: "short" }).format(new Date(2000, month, 1)));
const YEARS_BACK = 5;

type MonthPickerProps = { open: boolean; value: Month; onSelect: (month: Month) => void; onClose: () => void };

/** A year with its twelve months; months after the current one can't be picked. */
export function MonthPicker({ open, value, onSelect, onClose }: MonthPickerProps) {
  const insets = useSafeAreaInsets();
  const now = currentMonth();
  const [year, setYear] = useState(value.year);
  const isFuture = (month: number) => year > now.year || (year === now.year && month > now.month);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} onShow={() => setYear(value.year)} statusBarTranslucent navigationBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable onPress={onClose} className="absolute inset-0 bg-black/50" accessibilityLabel="Close" />
        <View className="gap-4 rounded-t-2xl bg-card px-4 pt-4" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-extrabold">Choose a month</Text>
            <Pressable onPress={onClose} className="size-8 items-center justify-center rounded-full bg-muted active:opacity-70" accessibilityLabel="Close" hitSlop={8}>
              <Icon as={X} size={16} />
            </Pressable>
          </View>

          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => setYear((current) => current - 1)}
              disabled={year <= now.year - YEARS_BACK}
              className={cn("size-10 items-center justify-center rounded-full active:bg-accent", year <= now.year - YEARS_BACK && "opacity-30")}
              accessibilityLabel="Previous year"
            >
              <Icon as={ChevronLeft} size={22} />
            </Pressable>
            <Text className="text-base font-bold">{year}</Text>
            <Pressable
              onPress={() => setYear((current) => current + 1)}
              disabled={year >= now.year}
              className={cn("size-10 items-center justify-center rounded-full active:bg-accent", year >= now.year && "opacity-30")}
              accessibilityLabel="Next year"
            >
              <Icon as={ChevronRight} size={22} />
            </Pressable>
          </View>

          <View className="flex-row flex-wrap gap-y-2">
            {MONTHS.map((label, month) => {
              const selected = value.year === year && value.month === month;
              const disabled = isFuture(month);
              return (
                <View key={label} className="w-1/4 px-1">
                  <Pressable
                    onPress={() => {
                      onSelect({ year, month });
                      onClose();
                    }}
                    disabled={disabled}
                    className={cn(
                      "h-11 items-center justify-center rounded-lg border",
                      selected ? "border-primary bg-primary" : "border-border active:bg-accent",
                      disabled && "opacity-30",
                    )}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled }}
                  >
                    <Text className={cn("text-sm font-semibold", selected && "text-primary-foreground")}>{label}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
