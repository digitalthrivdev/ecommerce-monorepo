import type { Metadata } from "next";
import Link from "next/link";

import { PageTitle } from "@/components/page-title";
import { QuickSearch } from "@/components/quick-search";
import { BrandFilters, Pagination } from "@/components/shop/listing";
import { ProductGrid } from "@/components/shop/product-card";
import { listBrands, listProducts, LISTING_PAGE_SIZE } from "@/lib/catalog";
import { getSettings } from "@/lib/website";

type Props = PageProps<"/search">;
export async function generateMetadata(): Promise<Metadata> { return { title: "Shop", description: "Browse and search our products", robots: { index: false, follow: true } }; }
export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const q = (first(params.q) ?? "").trim();
  const brand = first(params.brand);
  const inStock = first(params.inStock);
  const sortBy = first(params.sortBy);
  const page = Math.max(1, Math.floor(Number(first(params.page)) || 1));
  const filterParams = { q, brand, inStock, sortBy };
  const [result, brands, settings] = await Promise.all([
    listProducts({ search: q, brandId: brand, inStock, sortBy, page }),
    listBrands(),
    getSettings(),
  ]);
  return (
    <>
      <PageTitle title={q ? `Results for “${q}”` : "Shop all products"}>
        {result.total} {result.total === 1 ? "product" : "products"}
      </PageTitle>
      <section className="mx-auto w-full max-w-6xl px-5 pb-14">
        <div className="mb-7">
          <QuickSearch
            initialQuery={q}
            currency={settings.currency}
            placeholder="Search products by name, brand, or category..."
            inputClassName="h-12 text-base px-11"
          />
        </div>
        <BrandFilters path="/search" params={filterParams} brands={brands.items} brandId={brand} />
        {result.items.length ? (
          <div className="mt-8">
            <ProductGrid products={result.items} currency={settings.currency} />
          </div>
        ) : (
          <p className="mt-8 rounded-2xl border p-8 text-center text-muted-foreground">
            {q ? "No matching products. Try another search or filter." : <>Choose a category or <Link className="underline" href="/">browse the home page</Link>.</>}
          </p>
        )}
        <Pagination path="/search" params={filterParams} page={page} total={result.total} pageSize={LISTING_PAGE_SIZE} />
      </section>
    </>
  );
}
