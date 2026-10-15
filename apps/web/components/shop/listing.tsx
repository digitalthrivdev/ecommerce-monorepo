import Link from "next/link";

import { listingHref } from "@/lib/paths";

export function Pagination({ path, params, page, total, pageSize }: { path: string; params: { q?: string; brand?: string }; page: number; total: number; pageSize: number }) {
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
  if (brands.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={listingHref(path, params)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${brandId ? "bg-muted" : "bg-primary text-primary-foreground"}`}>
        All brands
      </Link>
      {brands.map((brand) => (
        <Link
          key={brand.id}
          href={listingHref(path, { ...params, brand: brand.id })}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${brandId === brand.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
        >
          {brand.name}
        </Link>
      ))}
    </div>
  );
}
