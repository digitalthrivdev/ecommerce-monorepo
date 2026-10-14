import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

import { useBandText } from "@/components/home/section-band";
import { ProductCard } from "@/components/product-card";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useSettings } from "@/lib/settings";
import type { Product } from "@/lib/types";

type SectionTitleProps = { title: string | null; description?: string | null; onSeeAll?: () => void };

export function SectionTitle({ title, description, onSeeAll }: SectionTitleProps) {
  const bandText = useBandText();
  const bandMuted = useBandText(true);
  if (!title && !description) return null;
  return (
    <View className="flex-row items-center justify-between gap-3 px-4 pb-3">
      <View className="flex-1">
        {title && (
          <Text className="text-lg font-extrabold" style={bandText} numberOfLines={1}>
            {title}
          </Text>
        )}
        {description && (
          <Text className="text-sm text-muted-foreground" style={bandMuted} numberOfLines={2}>
            {description}
          </Text>
        )}
      </View>
      {onSeeAll && (
        <Pressable onPress={onSeeAll} className="flex-row items-center active:opacity-70" hitSlop={8}>
          <Text className="text-sm font-bold text-primary" style={bandText}>
            See all
          </Text>
          <Icon as={ChevronRight} size={16} className="text-primary" color={bandText?.color} />
        </Pressable>
      )}
    </View>
  );
}

/** A titled, horizontally scrolling row of product cards. */
export function ProductRow({ title, description, products, onSeeAll }: SectionTitleProps & { products: Product[] }) {
  const { currency } = useSettings();
  if (products.length === 0) return null;

  return (
    <View>
      <SectionTitle title={title} description={description} onSeeAll={onSeeAll} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4 pb-1">
        {products.map((product) => (
          <ProductCard key={product.productId} product={product} currency={currency} className="w-36" />
        ))}
      </ScrollView>
    </View>
  );
}
