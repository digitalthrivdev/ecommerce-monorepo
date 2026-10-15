import type { MetadataRoute } from "next";

import { listCategories, listProducts } from "@/lib/catalog";
import { getSiteUrl, getWebsite, sitePages } from "@/lib/website";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ pages }, siteUrl, categories] = await Promise.all([getWebsite(), getSiteUrl(), listCategories()]);
  const products = [];
  let page = 1;
  let total = 0;
  do {
    const result = await listProducts({ page, pageSize: 100 });
    products.push(...result.items);
    total = result.total;
    page += 1;
  } while (products.length < total);
  const paths = ["", "/policies", "/delete-account", ...sitePages(pages).map((entry) => entry.path), ...categories.map((category) => `/c/${encodeURIComponent(category.slug)}`), ...products.map((product) => `/p/${encodeURIComponent(product.productId)}`)];
  return paths.map((path) => ({ url: `${siteUrl}${path}` }));
}
