/** A same-site path to return to after sign-in. Anything else goes to the account. */
export function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/account";
  return value;
}

export function listingHref(path: string, params: { q?: string; brand?: string; page?: number }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.brand) search.set("brand", params.brand);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}

export function categoryPath(slug: string) {
  return `/c/${encodeURIComponent(slug)}`;
}

export function productPath(id: string) {
  return `/p/${id}`;
}
