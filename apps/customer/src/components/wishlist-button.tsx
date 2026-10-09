import { Heart } from "lucide-react-native";
import { Pressable } from "react-native";

import { Icon } from "@/components/ui/icon";
import { useAppTheme } from "@/lib/app-theme";
import { cn } from "@/lib/utils";
import { useToggleWishlist, useWishlistIds } from "@/lib/wishlist";

/** `onImage`: drawn over a product image, which is white in dark mode too. */
type WishlistButtonProps = { productId: string; size?: number; onImage?: boolean; className?: string };

/** A heart that saves the product to the wishlist, or removes it. */
export function WishlistButton({ productId, size = 22, onImage = false, className }: WishlistButtonProps) {
  const { neutral } = useAppTheme();
  const savedIds = useWishlistIds();
  const toggle = useToggleWishlist();
  const saved = savedIds?.has(productId) ?? false;

  return (
    <Pressable
      onPress={() => toggle.mutate({ productId, saved: !saved })}
      disabled={!savedIds}
      className={cn("items-center justify-center rounded-full active:opacity-60", className)}
      accessibilityRole="button"
      accessibilityLabel={saved ? "Remove from wishlist" : "Add to wishlist"}
      accessibilityState={{ selected: saved }}
      hitSlop={6}
    >
      <Icon as={Heart} size={size} color={saved ? neutral.destructive : undefined} fill={saved ? neutral.destructive : "transparent"} className={saved ? undefined : onImage ? "text-zinc-700" : "text-foreground"} />
    </Pressable>
  );
}
