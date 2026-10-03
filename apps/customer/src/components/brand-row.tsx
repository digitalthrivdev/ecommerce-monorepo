import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { SectionTitle } from "@/components/product-row";
import { Text } from "@/components/ui/text";
import { useCardSurface } from "@/lib/app-theme";
import { smallImage } from "@/lib/images";
import { openBrand } from "@/lib/navigation";
import type { StoreBrand } from "@/lib/types";
import { cn } from "@/lib/utils";

function BrandTile({ brand }: { brand: StoreBrand }) {
  const surface = useCardSurface();
  const [failed, setFailed] = useState(false);

  return (
    <Pressable onPress={() => openBrand(brand)} className="w-[76px] items-center gap-1.5 active:opacity-70" accessibilityRole="button" accessibilityLabel={brand.name}>
      <View className={cn("size-[76px] items-center justify-center overflow-hidden rounded-lg", surface)}>
        {brand.logoUrl && !failed ? (
          <Image source={{ uri: smallImage(brand.logoUrl) }} style={{ width: "76%", height: "76%" }} contentFit="contain" onError={() => setFailed(true)} />
        ) : (
          <Text className="text-2xl font-extrabold text-primary">{brand.name.charAt(0)}</Text>
        )}
      </View>
      <Text className="text-center text-xs font-semibold leading-tight" numberOfLines={1}>
        {brand.name}
      </Text>
      <Text className="-mt-1 text-[10px] text-muted-foreground">
        {brand.productCount} item{brand.productCount === 1 ? "" : "s"}
      </Text>
    </Pressable>
  );
}

/** A titled row of brand logos that open the brand's products. */
export function BrandRow({ title, brands }: { title: string; brands: StoreBrand[] }) {
  if (brands.length === 0) return null;

  return (
    <View>
      <SectionTitle title={title} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4 pb-1">
        {brands.map((brand) => (
          <BrandTile key={brand.id} brand={brand} />
        ))}
      </ScrollView>
    </View>
  );
}
