import { Check, ChevronDown, X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { INDIAN_STATES } from "@/lib/indian-states";
import { cn } from "@/lib/utils";

type StatePickerProps = {
  value: string;
  onChange: (state: string) => void;
  error?: string;
  label?: string;
  required?: boolean;
};

/** The address's state, chosen from the list in a bottom sheet. */
export function StatePicker({ value, onChange, error, label = "State", required = false }: StatePickerProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const choose = (state: string) => {
    onChange(state);
    setOpen(false);
  };

  return (
    <View className="gap-1.5">
      <Text className="text-xs font-semibold">
        {label}
        {required ? <Text className="text-destructive">*</Text> : null}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        className={cn(
          "h-11 flex-row items-center rounded-lg border bg-card px-3 active:bg-accent",
          error ? "border-2 border-destructive" : "border-input",
        )}
        accessibilityRole="button"
        accessibilityLabel={value ? `State: ${value}. Change` : "Choose your state"}
      >
        <Text className={cn("flex-1 text-sm", !value && "text-muted-foreground")} numberOfLines={1}>
          {value || "State"}
        </Text>
        <Icon as={ChevronDown} size={18} className="text-muted-foreground" />
      </Pressable>
      {error ? <Text className="text-[11px] font-medium text-destructive">{error}</Text> : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent navigationBarTranslucent>
        <View className="flex-1 justify-end">
          <Pressable onPress={() => setOpen(false)} className="absolute inset-0 bg-black/50" accessibilityLabel="Close" />
          <View className="max-h-[75%] rounded-t-2xl bg-card" style={{ paddingBottom: insets.bottom + 12 }}>
            <View className="flex-row items-center gap-3 px-4 pb-2 pt-4">
              <Text className="flex-1 text-lg font-extrabold">Choose your state</Text>
              <Pressable
                onPress={() => setOpen(false)}
                className="size-8 items-center justify-center rounded-full bg-muted active:opacity-70"
                accessibilityLabel="Close"
                hitSlop={8}
              >
                <Icon as={X} size={16} />
              </Pressable>
            </View>
            <ScrollView contentContainerClassName="px-4">
              {INDIAN_STATES.map((state, index) => (
                <Pressable
                  key={state}
                  onPress={() => choose(state)}
                  className={cn("flex-row items-center py-3.5 active:opacity-70", index > 0 && "border-t border-border")}
                  accessibilityRole="button"
                  accessibilityState={{ selected: state === value }}
                >
                  <Text className={cn("flex-1 text-[15px]", state === value && "font-bold text-primary")}>{state}</Text>
                  {state === value && <Icon as={Check} size={18} className="text-primary" />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
