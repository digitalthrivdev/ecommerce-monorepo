import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

import { ProductCard } from "@/components/product-card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useSettings } from "@/lib/settings";
import type { StoreProduct } from "@/lib/types";

export function SectionTitle({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <View className="flex-row items-center justify-between gap-3 px-4 pb-3">
      <Text className="flex-1 text-lg font-extrabold" numberOfLines={1}>
        {title}
      </Text>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} className="flex-row items-center active:opacity-70" hitSlop={8}>
          <Text className="text-sm font-bold text-primary">See all</Text>
          <Icon as={ChevronRight} size={16} className="text-primary" />
        </Pressable>
      )}
    </View>
  );
}

/** A titled, horizontally scrolling row of product cards. */
export function ProductRow({ title, products, onSeeAll }: { title: string; products: StoreProduct[]; onSeeAll?: () => void }) {
  const { currency } = useSettings();
  if (products.length === 0) return null;

  return (
    <View>
      <SectionTitle title={title} onSeeAll={onSeeAll} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4 pb-1">
        {products.map((product) => (
          <ProductCard key={product.productId} product={product} currency={currency} className="w-36" />
        ))}
      </ScrollView>
    </View>
  );
}
