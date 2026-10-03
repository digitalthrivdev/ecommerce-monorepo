import { ProductRow } from "@/components/product-row";
import { openCategory } from "@/lib/navigation";
import type { DealsRailSection, ProductRailSection } from "@/lib/types";

export function ProductRail({ section }: { section: ProductRailSection | DealsRailSection }) {
  const { category } = section;
  return <ProductRow title={section.title} products={section.products} onSeeAll={category ? () => openCategory(category) : undefined} />;
}
