import { View } from "react-native";

import { CategoryGrid } from "@/components/category-grid";
import { BannerCarousel } from "@/components/home/banner-carousel";
import { OfferStrip } from "@/components/home/offer-strip";
import { ProductRail } from "@/components/home/product-rail";
import { Text } from "@/components/ui/text";
import type { HomeSection } from "@/lib/types";

function Section({ section }: { section: HomeSection }) {
  switch (section.type) {
    case "banner_carousel":
      return <BannerCarousel section={section} />;
    case "category_grid":
      return (
        <View>
          {section.title && <Text className="px-4 pb-3 text-lg font-extrabold">{section.title}</Text>}
          <CategoryGrid categories={section.categories} columns={section.columns} />
        </View>
      );
    case "product_rail":
      return <ProductRail section={section} />;
    case "offer_strip":
      return <OfferStrip section={section} />;
  }
}

/** The admin's home sections, in the order they arranged them. */
export function HomeSections({ sections }: { sections: HomeSection[] }) {
  if (sections.length === 0) {
    return <Text className="px-8 py-10 text-center text-sm text-muted-foreground">Nothing to show here yet. Check back soon.</Text>;
  }

  return (
    <View className="gap-6">
      {sections.map((section) => (
        <Section key={section.id} section={section} />
      ))}
    </View>
  );
}
