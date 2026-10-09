import { Image } from "expo-image";
import { Timer } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { ProductCartControl } from "@/components/variant-picker";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCardSurface } from "@/lib/app-theme";
import { defaultVariant } from "@/lib/catalog";
import { discountPercent, formatMoney, unitPrice } from "@/lib/format";
import { smallImage } from "@/lib/images";
import { openProduct } from "@/lib/navigation";
import { useSettings } from "@/lib/settings";
import type { StoreProduct } from "@/lib/types";
import { cn } from "@/lib/utils";

type ProductCardProps = { product: StoreProduct; currency: string; className?: string };

/** Shows the first in-stock variant; products with several variants add through a picker. */
export function ProductCard({ product, currency, className }: ProductCardProps) {
  const surface = useCardSurface();
  const { deliveryPromiseMinutes } = useSettings();
  const [failed, setFailed] = useState(false);
  const variant = defaultVariant(product.variants);
  if (!variant) return null;

  const imageUrl = variant.imageUrl ?? product.imageUrl;
  const discount = discountPercent(variant.sellingPrice, variant.mrp);
  const perUnit = unitPrice(variant.sellingPrice, variant.quantity, variant.unit, currency);
  const soldOut = !product.variants.some((candidate) => candidate.inStock);

  return (
    <Pressable onPress={() => openProduct(product.productId, variant.variantId)} className={cn("rounded-xl p-1.5 pb-2 active:opacity-80", surface, className)}>
      <View className="aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-white">
        <View className={cn("size-full items-center justify-center", soldOut && "opacity-40")}>
          {imageUrl && !failed ? (
            <Image source={{ uri: smallImage(imageUrl) }} style={{ width: "88%", height: "88%" }} contentFit="contain" onError={() => setFailed(true)} />
          ) : (
            <View className="size-full items-center justify-center bg-tile">
              <Text className="text-3xl font-extrabold text-primary">{product.name.charAt(0)}</Text>
            </View>
          )}
        </View>
        {soldOut ? (
          <View className="absolute rounded-md bg-foreground/80 px-2 py-1">
            <Text className="text-[11px] font-bold text-background">Out of stock</Text>
          </View>
        ) : discount ? (
          <DiscountRibbon percent={discount} />
        ) : null}
        {product.isVeg !== null && <VegMark veg={product.isVeg} className="absolute right-1.5 top-1.5" />}
        {variant.label ? (
          <View className="absolute bottom-1.5 left-1.5 max-w-[48%] rounded-md bg-muted px-1.5 py-0.5">
            <Text className="text-[11px] font-semibold" numberOfLines={1}>
              {variant.label}
            </Text>
          </View>
        ) : null}
      </View>
      {/* Half over the image's bottom edge. */}
      <View className="-mt-4 flex-row justify-end pr-1">
        <ProductCartControl product={product} variant={variant} />
      </View>
      <View className="mt-1 gap-0.5 px-0.5">
        {perUnit && <Text className="text-[11px] text-muted-foreground">{perUnit}</Text>}
        <View className="flex-row flex-wrap items-baseline gap-x-1.5">
          <Text className="text-base font-extrabold">{formatMoney(variant.sellingPrice, currency)}</Text>
          {discount && <Text className="text-xs text-muted-foreground line-through">{formatMoney(variant.mrp!, currency)}</Text>}
        </View>
        {discount && <Text className="text-[11px] font-bold text-primary">{discount}% OFF on MRP</Text>}
        <Text className="text-[13px] font-semibold leading-tight" numberOfLines={3}>
          {product.name}
        </Text>
        {deliveryPromiseMinutes ? (
          <View className="mt-0.5 flex-row items-center gap-1">
            <Icon as={Timer} size={11} className="text-muted-foreground" />
            <Text className="text-[10px] font-semibold text-muted-foreground">{deliveryPromiseMinutes} mins</Text>
          </View>
        ) : null}
      </View>
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
