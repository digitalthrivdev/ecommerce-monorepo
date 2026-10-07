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
        {soldOut ? (
          <View className="absolute rounded-md bg-foreground/80 px-2 py-1">
            <Text className="text-[11px] font-bold text-background">Out of stock</Text>
          </View>
        ) : discount ? (
          <DiscountRibbon percent={discount} />
        ) : null}
        {product.isVeg !== null && <VegMark veg={product.isVeg} className="absolute bottom-1 right-1" />}
      </View>
      <View className="flex-row items-start justify-between gap-1">
        <Text className="mt-1.5 shrink text-xs font-medium text-muted-foreground" numberOfLines={1}>
          {variant.label}
        </Text>
        <ProductCartControl product={product} variant={variant} />
      </View>
      <View>
        <View className="flex-row flex-wrap items-baseline gap-x-1.5">
          <Text className="text-[15px] font-extrabold">{formatMoney(variant.sellingPrice, currency)}</Text>
          {discount && <Text className="text-xs text-muted-foreground line-through">{formatMoney(variant.mrp!, currency)}</Text>}
        </View>
      </View>
      <Text className="text-[13px] font-semibold leading-tight" numberOfLines={2}>
        {product.name}
      </Text>
    </Pressable>
  );
}

/** A tag hanging from the image's top-left corner, e.g. "20% OFF". */
function DiscountRibbon({ percent }: { percent: number }) {
  return (
    <View className="absolute left-1.5 top-0 items-center rounded-b-md bg-primary px-1.5 pb-1 pt-0.5" accessibilityLabel={`${percent}% off`}>
      <Text className="text-[11px] font-black leading-tight text-primary-foreground">{percent}%</Text>
      <Text className="text-[9px] font-extrabold leading-none text-primary-foreground">OFF</Text>
    </View>
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
