import Link from "next/link";

import { listingHref } from "@/lib/paths";

export type ListingParams = {
  q?: string;
  brand?: string;
  minPrice?: string | number;
  maxPrice?: string | number;
  inStock?: string | boolean;
  sortBy?: string;
};

export function Pagination({
  path,
  params,
  page,
  total,
  pageSize,
}: {
  path: string;
  params: ListingParams;
  page: number;
  total: number;
  pageSize: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="mt-10 flex items-center justify-center gap-3 text-sm">
      {page > 1 ? (
        <Link href={listingHref(path, { ...params, page: page - 1 })} className="rounded-full border px-4 py-2 font-medium hover:bg-muted">
          Previous
        </Link>
      ) : (
        <span className="rounded-full border px-4 py-2 text-muted-foreground">Previous</span>
      )}
      <p>
        Page {page} of {pages}
      </p>
      {page < pages ? (
        <Link href={listingHref(path, { ...params, page: page + 1 })} className="rounded-full border px-4 py-2 font-medium hover:bg-muted">
          Next
        </Link>
      ) : (
        <span className="rounded-full border px-4 py-2 text-muted-foreground">Next</span>
      )}
    </nav>
  );
}

const SORT_OPTIONS = [
  { id: "", label: "Featured" },
  { id: "newest", label: "Newest" },
  { id: "price_asc", label: "Price: Low to High" },
  { id: "price_desc", label: "Price: High to Low" },
];

export function ListingFilters({
  path,
  params,
  brands,
}: {
  path: string;
  params: ListingParams;
  brands: { id: string; name: string }[];
}) {
  const currentSort = params.sortBy ?? "";
  const inStockActive = Boolean(params.inStock && String(params.inStock) !== "false");

  return (
    <div className="flex flex-col gap-4 border-b pb-6">
      {/* Brands row */}
      {brands.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brands</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={listingHref(path, { ...params, brand: undefined })}
              className={`rounded-full px-3 py-1.5 text-xs font-medium sm:text-sm ${
                params.brand ? "bg-muted hover:bg-muted/80" : "bg-primary text-primary-foreground"
              }`}
            >
              All brands
            </Link>
            {brands.map((brand) => (
              <Link
                key={brand.id}
                href={listingHref(path, { ...params, brand: brand.id })}
                className={`rounded-full px-3 py-1.5 text-xs font-medium sm:text-sm ${
                  params.brand === brand.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                }`}
              >
                {brand.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sort & Availability row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Sort Options */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sort:</span>
          {SORT_OPTIONS.map((option) => (
            <Link
              key={option.id}
              href={listingHref(path, { ...params, sortBy: option.id || undefined })}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium sm:text-sm ${
                currentSort === option.id ? "bg-primary text-primary-foreground font-semibold" : "border hover:bg-muted"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>

        {/* In Stock Only filter */}
        <Link
          href={listingHref(path, { ...params, inStock: inStockActive ? undefined : "true" })}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition sm:text-sm ${
            inStockActive ? "border-primary bg-primary/10 text-primary font-semibold" : "hover:bg-muted text-muted-foreground"
          }`}
        >
          <span>✓</span>
          <span>In stock only</span>
        </Link>
      </div>
    </div>
  );
}

export function BrandFilters({
  path,
  params,
  brands,
  brandId,
}: {
  path: string;
  params: { q?: string };
  brands: { id: string; name: string }[];
  brandId?: string;
}) {
  return <ListingFilters path={path} params={{ ...params, brand: brandId }} brands={brands} />;
}
