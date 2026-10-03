import { View } from "react-native";

import { BrandRow } from "@/components/brand-row";
import { CategoryGrid } from "@/components/category-grid";
import { BannerCarousel } from "@/components/home/banner-carousel";
import { BuyAgainRail } from "@/components/home/buy-again-rail";
import { CategoryDeals } from "@/components/home/category-deals";
import { ImageTiles } from "@/components/home/image-tiles";
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
    case "deals_rail":
      return <ProductRail section={section} />;
    case "offer_strip":
      return <OfferStrip section={section} />;
    case "buy_again":
      return <BuyAgainRail section={section} />;
    case "brand_rail":
      return <BrandRow title={section.title} brands={section.brands} />;
    case "category_deals":
      return <CategoryDeals section={section} />;
    case "image_tiles":
      return <ImageTiles section={section} />;
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
