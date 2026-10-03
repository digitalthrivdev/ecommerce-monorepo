import { ProductRow } from "@/components/product-row";
import { useDeliveryLocation } from "@/lib/delivery-location";
import { useBuyAgain } from "@/lib/orders";
import type { BuyAgainSection } from "@/lib/types";

/** Hidden until the customer has ordered something that's in stock at their store. */
export function BuyAgainRail({ section }: { section: BuyAgainSection }) {
  const { store } = useDeliveryLocation();
  const query = useBuyAgain(store?.id);
  return <ProductRow title={section.title} products={query.data?.items ?? []} />;
}
