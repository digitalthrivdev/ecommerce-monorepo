import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { ProductCartControl } from "@/components/variant-picker";
import { Text } from "@/components/ui/text";
import { useCardSurface } from "@/lib/app-theme";
import { defaultVariant } from "@/lib/catalog";
import { discountPercent, formatMoney } from "@/lib/format";
import { smallImage } from "@/lib/images";
import { openProduct } from "@/lib/navigation";
import type { StoreProduct } from "@/lib/types";
import { cn } from "@/lib/utils";

type ProductCardProps = { product: StoreProduct; currency: string; className?: string };

/** Shows the first in-stock variant; products with several variants add through a picker. */
export function ProductCard({ product, currency, className }: ProductCardProps) {
  const surface = useCardSurface();
  const [failed, setFailed] = useState(false);
  const variant = defaultVariant(product.variants);
  if (!variant) return null;

  const imageUrl = variant.imageUrl ?? product.imageUrl;
  const discount = discountPercent(variant.sellingPrice, variant.mrp);
  const soldOut = !product.variants.some((candidate) => candidate.inStock);

  return (
    <Pressable onPress={() => openProduct(product.productId, variant.variantId)} className={cn("gap-1.5 rounded-lg p-2 active:opacity-80", surface, className)}>
      <View className="aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-tile">
        <View className={cn("size-full items-center justify-center", soldOut && "opacity-40")}>
          {imageUrl && !failed ? (
            <Image source={{ uri: smallImage(imageUrl) }} style={{ width: "86%", height: "86%" }} contentFit="contain" onError={() => setFailed(true)} />
          ) : (
            <Text className="text-3xl font-extrabold text-primary">{product.name.charAt(0)}</Text>
          )}
        </View>
        {discount && !soldOut && (
          <View className="absolute left-0 top-0 rounded-br-md bg-primary px-1.5 py-0.5">
            <Text className="text-[10px] font-extrabold text-primary-foreground">{discount}% OFF</Text>
          </View>
        )}
        {soldOut && (
          <View className="absolute rounded-md bg-foreground/80 px-2 py-1">
            <Text className="text-[11px] font-bold text-background">Out of stock</Text>
          </View>
        )}
        {product.isVeg !== null && <VegMark veg={product.isVeg} className="absolute right-1 top-1" />}
      </View>
      <Text className="min-h-9 text-[13px] font-semibold leading-tight" numberOfLines={2}>
        {product.name}
      </Text>
      <Text className="text-xs text-muted-foreground" numberOfLines={1}>
        {variant.label || " "}
      </Text>
      <View className="mt-auto flex-row items-end justify-between gap-1">
        <View className="shrink">
          <Text className="text-sm font-extrabold" numberOfLines={1}>
            {formatMoney(variant.sellingPrice, currency)}
          </Text>
          {discount && (
            <Text className="text-xs text-muted-foreground line-through" numberOfLines={1}>
              {formatMoney(variant.mrp!, currency)}
            </Text>
          )}
        </View>
        <ProductCartControl product={product} variant={variant} />
      </View>
    </Pressable>
  );
}

/** The green or brown square-and-dot mark Indian food packs carry. */
export function VegMark({ veg, className }: { veg: boolean; className?: string }) {
  return (
    <View
      className={cn("size-3.5 items-center justify-center rounded-[2px] border bg-white", veg ? "border-green-700" : "border-amber-800", className)}
      accessibilityLabel={veg ? "Vegetarian" : "Non-vegetarian"}
    >
      <View className={cn("size-1.5 rounded-full", veg ? "bg-green-700" : "bg-amber-800")} />
    </View>
  );
}
