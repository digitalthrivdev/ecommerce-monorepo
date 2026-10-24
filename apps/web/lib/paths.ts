/** A same-site path to return to after sign-in. Anything else goes to the account. */
export function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/account";
  return value;
}

export function listingHref(path: string, params: {
  q?: string;
  brand?: string;
  minPrice?: string | number;
  maxPrice?: string | number;
  inStock?: string | boolean;
  sortBy?: string;
  page?: number;
}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.brand) search.set("brand", params.brand);
  if (params.minPrice) search.set("minPrice", String(params.minPrice));
  if (params.maxPrice) search.set("maxPrice", String(params.maxPrice));
  if (params.inStock && String(params.inStock) !== "false") search.set("inStock", "true");
  if (params.sortBy) search.set("sortBy", params.sortBy);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}

export function categoryPath(slug: string) {
  return `/c/${encodeURIComponent(slug)}`;
}

export function productPath(slugOrId: string, searchParams?: Record<string, string | undefined | null>) {
  const base = `/p/${encodeURIComponent(slugOrId)}`;
  if (!searchParams) return base;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v != null && v !== "") search.set(k, v);
  }
  const text = search.toString();
  return text ? `${base}?${text}` : base;
}
