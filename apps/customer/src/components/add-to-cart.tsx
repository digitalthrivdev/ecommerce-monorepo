import { Minus, Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { MAX_QUANTITY_PER_ITEM, useCartActions, useCartQuantity } from "@/lib/cart";
import type { StoreProduct } from "@/lib/types";
import { cn } from "@/lib/utils";

type Size = "sm" | "lg";

const BOX: Record<Size, string> = { sm: "h-8 w-[74px]", lg: "h-11 w-32" };
const LABEL: Record<Size, string> = { sm: "text-sm", lg: "text-base" };
const ICON_SIZE: Record<Size, number> = { sm: 14, lg: 18 };

type QuantityStepperProps = { quantity: number; onChange: (quantity: number) => void; size?: Size };

export function QuantityStepper({ quantity, onChange, size = "sm" }: QuantityStepperProps) {
  const atMax = quantity >= MAX_QUANTITY_PER_ITEM;

  return (
    <View className={cn("flex-row items-center rounded-md bg-primary", BOX[size])}>
      <Pressable onPress={() => onChange(quantity - 1)} className="h-full flex-1 items-center justify-center active:opacity-60" accessibilityLabel="Remove one" hitSlop={4}>
        <Icon as={Minus} size={ICON_SIZE[size]} className="text-primary-foreground" />
      </Pressable>
      <Text className={cn("min-w-5 text-center font-extrabold text-primary-foreground", LABEL[size])}>{quantity}</Text>
      <Pressable
        onPress={() => onChange(quantity + 1)}
        disabled={atMax}
        className={cn("h-full flex-1 items-center justify-center active:opacity-60", atMax && "opacity-40")}
        accessibilityLabel="Add one"
        hitSlop={4}
      >
        <Icon as={Plus} size={ICON_SIZE[size]} className="text-primary-foreground" />
      </Pressable>
    </View>
  );
}

/** "ADD" until the product is in the cart, then a quantity stepper. */
export function AddToCartButton({ product, size = "sm" }: { product: StoreProduct; size?: Size }) {
  const quantity = useCartQuantity(product.productId);
  const { add, setQuantity } = useCartActions();

  if (quantity > 0) {
    return <QuantityStepper quantity={quantity} onChange={(next) => setQuantity(product.productId, next, product)} size={size} />;
  }

  return (
    <Pressable
      onPress={() => add(product)}
      disabled={!product.inStock}
      className={cn("items-center justify-center rounded-md border border-primary bg-card active:bg-accent", BOX[size], !product.inStock && "border-border opacity-50")}
      accessibilityLabel={`Add ${product.name} to cart`}
    >
      <Text className={cn("font-extrabold text-primary", LABEL[size], !product.inStock && "text-muted-foreground")}>ADD</Text>
    </Pressable>
  );
}
