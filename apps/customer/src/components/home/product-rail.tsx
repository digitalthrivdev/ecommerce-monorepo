import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

import { ProductCard } from "@/components/product-card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { openCategory } from "@/lib/navigation";
import { useSettings } from "@/lib/settings";
import type { ProductRailSection } from "@/lib/types";

export function ProductRail({ section }: { section: ProductRailSection }) {
  const { currency } = useSettings();

  return (
    <View>
      <View className="flex-row items-center justify-between gap-3 px-4 pb-3">
        <Text className="flex-1 text-lg font-extrabold" numberOfLines={1}>
          {section.title}
        </Text>
        <Pressable onPress={() => openCategory(section.category)} className="flex-row items-center active:opacity-70" hitSlop={8}>
          <Text className="text-sm font-bold text-primary">See all</Text>
          <Icon as={ChevronRight} size={16} className="text-primary" />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4 pb-1">
        {section.products.map((product) => (
          <ProductCard key={product.storeProductId} product={product} currency={currency} className="w-36" />
        ))}
      </ScrollView>
    </View>
  );
}
