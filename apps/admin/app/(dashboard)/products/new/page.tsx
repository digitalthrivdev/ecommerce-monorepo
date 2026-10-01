import type { Metadata } from "next";

import { ProductForm } from "@/components/catalog/product-form";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { requireAdmin } from "@/lib/dal";
import type { Category, Paginated } from "@/lib/types";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdmin();
  const categories = await apiFetch<Paginated<Category>>("/categories", { query: { includeInactive: true, limit: 100 } });

  return (
    <>
      <PageHeader title="New product" description="Add it to the catalog, then list it at stores with a price." />
      <div className="p-4 md:p-6">
        <Card className="max-w-2xl">
          <CardContent>
            <ProductForm categories={categories.items} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
