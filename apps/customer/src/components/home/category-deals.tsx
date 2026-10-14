import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { SectionTitle } from "@/components/product-row";
import { Text } from "@/components/ui/text";
import { useCardSurface } from "@/lib/app-theme";
import { smallImage } from "@/lib/images";
import { openCategory } from "@/lib/navigation";
import type { CategoryDealsSection } from "@/lib/types";
import { cn } from "@/lib/utils";

type DealCategory = CategoryDealsSection["categories"][number];

function DealTile({ category }: { category: DealCategory }) {
  const surface = useCardSurface();
  const [failed, setFailed] = useState(false);

  return (
    <Pressable
      onPress={() => openCategory(category)}
      className={cn("w-[108px] overflow-hidden rounded-lg active:opacity-80", surface)}
      accessibilityRole="button"
      accessibilityLabel={`${category.name}, up to ${category.maxDiscountPercent}% off`}
    >
      <View className="self-start rounded-br-lg bg-primary px-2 py-1">
        <Text className="text-[10px] font-extrabold leading-tight text-primary-foreground">UP TO</Text>
        <Text className="text-sm font-extrabold leading-tight text-primary-foreground">{category.maxDiscountPercent}% OFF</Text>
      </View>
      <View className="h-20 items-center justify-center">
        {category.imageUrl && !failed ? (
          <Image source={{ uri: smallImage(category.imageUrl) }} style={{ width: "72%", height: "100%" }} contentFit="contain" onError={() => setFailed(true)} />
        ) : (
          <Text className="text-3xl font-extrabold text-primary">{category.name.charAt(0)}</Text>
        )}
      </View>
      <Text className="px-2 pb-2.5 pt-1 text-xs font-bold leading-tight" numberOfLines={2}>
        {category.name}
      </Text>
    </Pressable>
  );
}

/** Category tiles showing the biggest discount in each. */
export function CategoryDeals({ section }: { section: CategoryDealsSection }) {
  return (
    <View>
      <SectionTitle title={section.title} description={section.description} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4 pb-1">
        {section.categories.map((category) => (
          <DealTile key={category.id} category={category} />
        ))}
      </ScrollView>
    </View>
  );
}
