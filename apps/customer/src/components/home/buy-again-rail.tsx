import { ProductRow } from "@/components/product-row";
import { useBuyAgain } from "@/lib/orders";
import type { BuyAgainSection } from "@/lib/types";

/** Hidden until the customer has ordered something that's in stock. */
export function BuyAgainRail({ section }: { section: BuyAgainSection }) {
  const query = useBuyAgain();
  return <ProductRow title={section.title} description={section.description} products={query.data?.items ?? []} />;
}
