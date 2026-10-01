import { router } from "expo-router";
import { ChevronRight, ShoppingBag } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCart } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

type CartBarProps = {
  /** Pad for the home indicator; off above a tab bar. */
  inset?: boolean;
  className?: string;
};

/** "View cart" bar shown at the bottom of shopping screens while the cart has items. */
export function CartBar({ inset = true, className }: CartBarProps) {
  const insets = useSafeAreaInsets();
  const { currency } = useSettings();
  const cart = useCart().data;

  if (!cart || cart.itemCount === 0) return null;

  return (
    <View className={cn("bg-background px-3 pt-2", className)} style={{ paddingBottom: (inset ? insets.bottom : 0) + 8 }}>
      <Pressable
        onPress={() => router.push("/cart")}
        className="h-14 flex-row items-center justify-between rounded-lg bg-primary px-4 active:opacity-90"
        accessibilityRole="button"
        accessibilityLabel="View cart"
      >
        <View className="flex-row items-center gap-3">
          <Icon as={ShoppingBag} size={22} className="text-primary-foreground" />
          <View>
            <Text className="text-sm font-extrabold text-primary-foreground">
              {cart.itemCount} {cart.itemCount === 1 ? "item" : "items"}
            </Text>
            <Text className="text-xs font-semibold text-primary-foreground">{formatMoney(cart.subtotal, currency)}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-0.5">
          <Text className="text-base font-extrabold text-primary-foreground">View cart</Text>
          <Icon as={ChevronRight} size={20} className="text-primary-foreground" />
        </View>
      </Pressable>
    </View>
  );
}
