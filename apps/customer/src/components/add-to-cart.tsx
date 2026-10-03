import { Minus, Plus } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { MAX_QUANTITY_PER_ITEM, useCartActions, useCartQuantity, type Sellable } from "@/lib/cart";
import { cn } from "@/lib/utils";

type Size = "sm" | "lg";

const BOX: Record<Size, string> = { sm: "h-8 w-[74px]", lg: "h-11 w-32" };
const LABEL: Record<Size, string> = { sm: "text-sm", lg: "text-base" };
const ICON_SIZE: Record<Size, number> = { sm: 14, lg: 18 };

type QuantityStepperProps = { quantity: number; onChange: (quantity: number) => void; max?: number; size?: Size; onIncrease?: () => void };

/** `onIncrease` replaces adding one, for steppers that open a picker instead. */
export function QuantityStepper({ quantity, onChange, max = MAX_QUANTITY_PER_ITEM, size = "sm", onIncrease }: QuantityStepperProps) {
  const atMax = !onIncrease && quantity >= max;

  return (
    <View className={cn("flex-row items-center rounded-md bg-primary", BOX[size])}>
      <Pressable onPress={() => onChange(quantity - 1)} className="h-full flex-1 items-center justify-center active:opacity-60" accessibilityLabel="Remove one" hitSlop={4}>
        <Icon as={Minus} size={ICON_SIZE[size]} className="text-primary-foreground" />
      </Pressable>
      <Text className={cn("min-w-5 text-center font-extrabold text-primary-foreground", LABEL[size])}>{quantity}</Text>
      <Pressable
        onPress={onIncrease ?? (() => onChange(quantity + 1))}
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

type AddButtonProps = { onPress: () => void; disabled: boolean; accessibilityLabel: string; size?: Size };

export function AddButton({ onPress, disabled, accessibilityLabel, size = "sm" }: AddButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={cn("items-center justify-center rounded-md border border-primary bg-card active:bg-accent", BOX[size], disabled && "border-border opacity-50")}
      accessibilityLabel={accessibilityLabel}
    >
      <Text className={cn("font-extrabold text-primary", LABEL[size], disabled && "text-muted-foreground")}>ADD</Text>
    </Pressable>
  );
}

/** "ADD" until the variant is in the cart, then a quantity stepper. */
export function AddToCartButton({ product, variant, size = "sm" }: Sellable & { size?: Size }) {
  const quantity = useCartQuantity(variant.variantId);
  const { add, setQuantity } = useCartActions();

  if (quantity > 0) {
    return (
      <QuantityStepper
        quantity={quantity}
        max={variant.maxOrderQuantity}
        onChange={(next) => setQuantity(variant.variantId, next, { product, variant })}
        size={size}
      />
    );
  }

  return (
    <AddButton
      onPress={() => add({ product, variant })}
      disabled={!variant.inStock}
      accessibilityLabel={`Add ${product.name}${variant.label ? `, ${variant.label},` : ""} to cart`}
      size={size}
    />
  );
}
