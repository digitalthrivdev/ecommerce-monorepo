import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { useCardSurface } from "@/lib/app-theme";
import { discountPercent, formatMoney, formatPackSize } from "@/lib/format";
import { openProduct } from "@/lib/navigation";
import type { StoreProduct } from "@/lib/types";
import { cn } from "@/lib/utils";

type ProductCardProps = { product: StoreProduct; currency: string; className?: string };

export function ProductCard({ product, currency, className }: ProductCardProps) {
  const surface = useCardSurface();
  const [failed, setFailed] = useState(false);
  const discount = discountPercent(product.sellingPrice, product.mrp);
  const packSize = formatPackSize(product.quantity, product.unit);
  const soldOut = !product.inStock;

  return (
    <Pressable onPress={() => openProduct(product.productId)} className={cn("gap-1.5 rounded-lg p-2 active:opacity-80", surface, className)}>
      <View className="aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-tile">
        <View className={cn("size-full items-center justify-center", soldOut && "opacity-40")}>
          {product.imageUrl && !failed ? (
            <Image source={{ uri: product.imageUrl }} style={{ width: "86%", height: "86%" }} contentFit="contain" onError={() => setFailed(true)} />
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
      </View>
      <Text className="min-h-9 text-[13px] font-semibold leading-tight" numberOfLines={2}>
        {product.name}
      </Text>
      <Text className="text-xs text-muted-foreground" numberOfLines={1}>
        {packSize ?? " "}
      </Text>
      <View className="flex-row items-baseline gap-1.5">
        <Text className="text-sm font-extrabold">{formatMoney(product.sellingPrice, currency)}</Text>
        {discount && <Text className="text-xs text-muted-foreground line-through">{formatMoney(product.mrp!, currency)}</Text>}
      </View>
    </Pressable>
  );
}
