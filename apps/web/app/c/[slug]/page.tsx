import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageTitle } from "@/components/page-title";
import { BrandFilters, Pagination } from "@/components/shop/listing";
import { ProductGrid } from "@/components/shop/product-card";
import { categoryBySlug, listBrands, listProducts, LISTING_PAGE_SIZE } from "@/lib/catalog";
import { getSettings } from "@/lib/website";

type Props = PageProps<"/c/[slug]"> & {
  searchParams: Promise<{ q?: string; brand?: string; page?: string; inStock?: string; sortBy?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await categoryBySlug((await params).slug);
  if (!category) return { title: "Category not found" };
  return { title: category.name, description: `Shop ${category.name}`, alternates: { canonical: `/c/${encodeURIComponent(category.slug)}` }, openGraph: { title: category.name, description: `Shop ${category.name}` } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [category, query, settings] = await Promise.all([categoryBySlug((await params).slug), searchParams, getSettings()]);
  if (!category) notFound();
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const filterParams = { q: query.q, brand: query.brand, inStock: query.inStock, sortBy: query.sortBy };
  const [result, brands] = await Promise.all([
    listProducts({ categoryId: category.id, brandId: query.brand, search: query.q, inStock: query.inStock, sortBy: query.sortBy, page }),
    listBrands(category.id),
  ]);
  return (
    <>
      <PageTitle title={category.name}>
        {category.parent && (
          <p>
            <a className="underline" href={`/c/${encodeURIComponent(category.parent.slug)}`}>
              {category.parent.name}
            </a>
          </p>
        )}
      </PageTitle>
      <section className="mx-auto w-full max-w-6xl px-5 pb-14">
        <BrandFilters path={`/c/${encodeURIComponent(category.slug)}`} params={filterParams} brands={brands.items} brandId={query.brand} />
        <div className="mt-8">
          {result.items.length ? (
            <ProductGrid products={result.items} currency={settings.currency} />
          ) : (
            <p className="rounded-2xl border p-8 text-center text-muted-foreground">No products found matching these filters.</p>
          )}
        </div>
        <Pagination path={`/c/${encodeURIComponent(category.slug)}`} params={filterParams} page={page} total={result.total} pageSize={LISTING_PAGE_SIZE} />
      </section>
    </>
  );
}
