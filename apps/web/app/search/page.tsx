import type { Metadata } from "next";
import Link from "next/link";

import { PageTitle } from "@/components/page-title";
import { BrandFilters, Pagination } from "@/components/shop/listing";
import { ProductGrid } from "@/components/shop/product-card";
import { listBrands, listProducts, LISTING_PAGE_SIZE } from "@/lib/catalog";
import { getSettings } from "@/lib/website";

type Props = PageProps<"/search">;
export async function generateMetadata(): Promise<Metadata> { return { title: "Shop", description: "Browse and search our products", robots: { index: false, follow: true } }; }
export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const q = (first(params.q) ?? "").trim();
  const brand = first(params.brand);
  const page = Math.max(1, Math.floor(Number(first(params.page)) || 1));
  const [result, brands, settings] = await Promise.all([listProducts({ search: q, brandId: brand, page }), listBrands(), getSettings()]);
  return <><PageTitle title={q ? `Results for “${q}”` : "Shop all products"}>{result.total} {result.total === 1 ? "product" : "products"}</PageTitle><section className="mx-auto w-full max-w-6xl px-5 pb-14"><form action="/search" className="mb-7 flex gap-2"><label className="sr-only" htmlFor="q">Search products</label><input id="q" name="q" defaultValue={q} placeholder="Search products" className="h-12 min-w-0 flex-1 rounded-full border bg-white px-5"/><button className="h-12 rounded-full bg-primary px-6 font-semibold text-primary-foreground">Search</button></form><BrandFilters path="/search" params={{ q }} brands={brands.items} brandId={brand}/>{result.items.length ? <div className="mt-8"><ProductGrid products={result.items} currency={settings.currency}/></div> : <p className="mt-8 rounded-2xl border p-8 text-center text-muted-foreground">{q ? "No matching products. Try another search." : <>Choose a category or <Link className="underline" href="/">browse the home page</Link>.</>}</p>}<Pagination path="/search" params={{q, brand}} page={page} total={result.total} pageSize={LISTING_PAGE_SIZE}/></section></>;
}
