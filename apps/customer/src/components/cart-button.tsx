import { router } from "expo-router";
import { ShoppingBag } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCart } from "@/lib/cart";
import { cn } from "@/lib/utils";

type CartButtonProps = {
  className?: string;
  size?: number;
  iconSize?: number;
  color?: string;
};

/**
 * Standard e-commerce cart button with an item count notification badge.
 * Tapping navigates to the cart screen.
 */
export function CartButton({ className, size = 44, iconSize = 22, color }: CartButtonProps) {
  const cart = useCart().data;
  const count = cart?.itemCount ?? 0;

  return (
    <Pressable
      onPress={() => router.push("/cart")}
      className={cn("relative items-center justify-center rounded-full active:opacity-75", className)}
      style={{ width: size, height: size }}
      accessibilityRole="button"
      accessibilityLabel={`Shopping cart, ${count} ${count === 1 ? "item" : "items"}`}
      hitSlop={6}
    >
      <Icon as={ShoppingBag} size={iconSize} className={color ? undefined : "text-foreground"} color={color} />
      {count > 0 && (
        <View className="absolute right-0.5 top-0.5 min-w-[18px] h-[18px] items-center justify-center rounded-full bg-primary px-1 border border-background">
          <Text className="text-[10px] font-black text-primary-foreground leading-none">
            {count > 99 ? "99+" : count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
