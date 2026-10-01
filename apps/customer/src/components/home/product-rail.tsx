import { Image } from "expo-image";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { Text } from "@/components/ui/text";
import { useCardSurface } from "@/lib/app-theme";
import { discountPercent, formatMoney, formatPackSize } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import type { ProductRailSection, StoreProduct } from "@/lib/types";
import { cn } from "@/lib/utils";

function ProductCard({ product, currency }: { product: StoreProduct; currency: string }) {
  const surface = useCardSurface();
  const [failed, setFailed] = useState(false);
  const discount = discountPercent(product.sellingPrice, product.mrp);
  const packSize = formatPackSize(product.quantity, product.unit);

  return (
    <View className={cn("w-36 gap-1.5 rounded-lg p-2", surface)}>
      <View className="aspect-square w-full items-center justify-center overflow-hidden rounded-md bg-tile">
        {product.imageUrl && !failed ? (
          <Image source={{ uri: product.imageUrl }} style={{ width: "86%", height: "86%" }} contentFit="contain" onError={() => setFailed(true)} />
        ) : (
          <Text className="text-3xl font-extrabold text-primary">{product.name.charAt(0)}</Text>
        )}
        {discount && (
          <View className="absolute left-0 top-0 rounded-br-md bg-primary px-1.5 py-0.5">
            <Text className="text-[10px] font-extrabold text-primary-foreground">{discount}% OFF</Text>
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
    </View>
  );
}

export function ProductRail({ section }: { section: ProductRailSection }) {
  const { currency } = useSettings();

  return (
    <View>
      <Text className="px-4 pb-3 text-lg font-extrabold">{section.title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4 pb-1">
        {section.products.map((product) => (
          <ProductCard key={product.storeProductId} product={product} currency={currency} />
        ))}
      </ScrollView>
    </View>
  );
}
