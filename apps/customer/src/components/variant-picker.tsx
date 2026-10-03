import { Image } from "expo-image";
import { X } from "lucide-react-native";
import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AddButton, AddToCartButton, QuantityStepper } from "@/components/add-to-cart";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useProductCartQuantity } from "@/lib/cart";
import { discountPercent, formatMoney } from "@/lib/format";
import { smallImage } from "@/lib/images";
import { useSettings } from "@/lib/settings";
import type { StoreProduct, StoreVariant } from "@/lib/types";
import { cn } from "@/lib/utils";

function VariantRow({ product, variant, currency }: { product: StoreProduct; variant: StoreVariant; currency: string }) {
  const [failed, setFailed] = useState(false);
  const imageUrl = variant.imageUrl ?? product.imageUrl;
  const discount = discountPercent(variant.sellingPrice, variant.mrp);

  return (
    <View className="flex-row items-center gap-3 py-3">
      <View className={cn("size-14 items-center justify-center overflow-hidden rounded-md bg-tile", !variant.inStock && "opacity-40")}>
        {imageUrl && !failed ? (
          <Image source={{ uri: smallImage(imageUrl) }} style={{ width: "86%", height: "86%" }} contentFit="contain" onError={() => setFailed(true)} />
        ) : (
          <Text className="text-lg font-extrabold text-primary">{product.name.charAt(0)}</Text>
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-semibold" numberOfLines={2}>
          {variant.label || product.name}
        </Text>
        <View className="flex-row flex-wrap items-baseline gap-x-1.5">
          <Text className="text-sm font-extrabold">{formatMoney(variant.sellingPrice, currency)}</Text>
          {discount && <Text className="text-xs text-muted-foreground line-through">{formatMoney(variant.mrp!, currency)}</Text>}
          {discount && <Text className="text-xs font-bold text-primary">{discount}% off</Text>}
        </View>
        {!variant.inStock && <Text className="text-xs font-semibold text-destructive">Out of stock</Text>}
      </View>
      <AddToCartButton product={product} variant={variant} />
    </View>
  );
}

type VariantPickerProps = { product: StoreProduct; open: boolean; onClose: () => void };

/** Bottom sheet listing a product's variants, each with its own add-to-cart. */
export function VariantPicker({ product, open, onClose }: VariantPickerProps) {
  const insets = useSafeAreaInsets();
  const { currency } = useSettings();

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable onPress={onClose} className="absolute inset-0 bg-black/50" accessibilityLabel="Close" />
        <View className="max-h-[75%] rounded-t-2xl bg-card" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="flex-row items-start gap-3 px-4 pb-1 pt-4">
            <Text className="flex-1 text-lg font-extrabold leading-tight" numberOfLines={2}>
              {product.name}
            </Text>
            <Pressable onPress={onClose} className="size-8 items-center justify-center rounded-full bg-muted active:opacity-70" accessibilityLabel="Close" hitSlop={8}>
              <Icon as={X} size={16} />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="px-4">
            {product.variants.map((variant, index) => (
              <View key={variant.variantId} className={cn(index > 0 && "border-t border-border")}>
                <VariantRow product={product} variant={variant} currency={currency} />
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** For a product with several variants: opens the picker. Once some are in the cart it shows their total, and both buttons open the picker. */
function ChooseVariantButton({ product }: { product: StoreProduct }) {
  const [open, setOpen] = useState(false);
  const quantity = useProductCartQuantity(product.productId);
  const show = () => setOpen(true);

  return (
    <View className="items-center">
      {quantity > 0 ? (
        <QuantityStepper quantity={quantity} onChange={show} onIncrease={show} />
      ) : (
        <AddButton onPress={show} disabled={!product.variants.some((variant) => variant.inStock)} accessibilityLabel={`Choose an option of ${product.name}`} />
      )}
      <Text className="mt-0.5 text-[10px] font-semibold text-muted-foreground">{product.variants.length} options</Text>
      <VariantPicker product={product} open={open} onClose={() => setOpen(false)} />
    </View>
  );
}

/** Add-to-cart for a product card: direct for a single variant, through the picker for several. */
export function ProductCartControl({ product, variant }: { product: StoreProduct; variant: StoreVariant }) {
  if (product.variants.length > 1) return <ChooseVariantButton product={product} />;
  return <AddToCartButton product={product} variant={variant} />;
}
