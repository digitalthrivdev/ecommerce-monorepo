import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Plus, Search, Upload, X } from "lucide-react";

import { ProductsTable } from "@/components/catalog/products-table";
import { CategoryFilter } from "@/components/category-filter";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { PageTabs } from "@/components/page-tabs";
import { PaginationLinks } from "@/components/pagination-links";
import { ParamSelect } from "@/components/param-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import type { Brand, Category, Paginated, ProductListItem } from "@/lib/types";

export const metadata: Metadata = { title: "Products" };

const PAGE_SIZE = 50;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const oneOf = <T extends string>(value: string | undefined, allowed: readonly T[]) => (allowed as readonly string[]).includes(value ?? "") ? (value as T) : undefined;

const STATUSES = ["active", "hidden"] as const;

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  await requireAdmin();
  const params = await searchParams;
  const q = first(params.q)?.trim().slice(0, 100) || undefined;
  const categoryId = first(params.categoryId) || undefined;
  const brandId = first(params.brandId) || undefined;
  const status = oneOf(first(params.status), STATUSES);
  const outOfStock = first(params.stock) === "out";
  const missingTax = first(params.tax) === "missing";
  const page = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);

  const [products, categories, brands, untaxed, settings] = await Promise.all([
    apiFetch<Paginated<ProductListItem>>("/products", {
      query: {
        includeInactive: true,
        search: q,
        categoryId,
        brandId,
        status,
        outOfStock: outOfStock || undefined,
        missingTax: missingTax || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      },
    }),
    apiFetch<Paginated<Category>>("/categories", { query: { includeInactive: true, limit: 200 } }),
    apiFetch<Paginated<Brand>>("/brands", { query: { includeInactive: true, limit: 200 } }),
    missingTax ? null : apiFetch<Paginated<ProductListItem>>("/products", { query: { includeInactive: true, missingTax: true, limit: 1 } }),
    getPublicSettings(),
  ]);

  const current = { q, categoryId, brandId, status, stock: outOfStock ? "out" : undefined, tax: missingTax ? "missing" : undefined };
  const href = (changes: Partial<typeof current> & { page?: number }) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...current, ...changes, page: undefined })) if (value) next.set(key, String(value));
    if (changes.page && changes.page > 1) next.set("page", String(changes.page));
    const query = next.toString();
    return query ? `/products?${query}` : "/products";
  };
  const lastPage = Math.max(1, Math.ceil(products.total / PAGE_SIZE));
  const filtered = Boolean(q || categoryId || brandId || outOfStock || missingTax);

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything the shop sells, with prices and stock"
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/products/import">
                <Upload />
                Import CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href="/products/new">
                <Plus />
                New product
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        {untaxed && untaxed.total > 0 && (
          <Notice tone="warning" title={`${untaxed.total} ${untaxed.total === 1 ? "product has" : "products have"} no GST rate or HSN code`}>
            Products without a GST rate are sold with no GST on their invoices. <Link href="/products?tax=missing" className="font-medium underline underline-offset-4">Show them</Link>
          </Notice>
        )}
        <PageTabs
          label="Show products"
          active={status ?? "all"}
          tabs={[
            { id: "all", label: "All", href: href({ status: undefined }) },
            { id: "active", label: "In the app", href: href({ status: "active" }) },
            { id: "hidden", label: "Hidden", href: href({ status: "hidden" }) },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Form action="/products" className="flex gap-2">
            {Object.entries(current).map(([key, value]) => key !== "q" && value && <input key={key} type="hidden" name={key} value={value} />)}
            <Input name="q" type="search" defaultValue={q} maxLength={100} placeholder="Product name, brand or code" aria-label="Search products" className="w-64" />
            <Button type="submit" variant="outline" size="icon" aria-label="Search">
              <Search />
            </Button>
          </Form>
          <CategoryFilter categories={categories.items} />
          <ParamSelect
            param="brandId"
            label="Filter by brand"
            allLabel="All brands"
            options={brands.items.map((brand) => ({ value: brand.id, label: brand.name }))}
          />
          <ParamSelect param="stock" label="Filter by stock" allLabel="Any stock" options={[{ value: "out", label: "A size out of stock" }]} />
          <ParamSelect param="tax" label="Filter by GST details" allLabel="Any GST details" options={[{ value: "missing", label: "Missing GST rate or HSN" }]} />
          {filtered && (
            <Button asChild variant="ghost" size="sm">
              <Link href={status ? `/products?status=${status}` : "/products"}>
                <X />
                Clear filters
              </Link>
            </Button>
          )}
        </div>

        <Card>
          <CardContent>
            {products.items.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                {filtered || status ? "No products match these filters." : "No products yet."}
              </p>
            ) : (
              <ProductsTable products={products.items} currency={settings.currency} />
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {products.total === 0
              ? ""
              : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, products.total)} of ${products.total} ${products.total === 1 ? "product" : "products"}`}
          </span>
          {products.total > PAGE_SIZE && <PaginationLinks page={page} lastPage={lastPage} href={(nextPage) => href({ page: nextPage })} />}
        </div>
      </div>
    </>
  );
}
