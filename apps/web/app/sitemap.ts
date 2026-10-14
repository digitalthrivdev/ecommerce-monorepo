import type { MetadataRoute } from "next";

import { getSiteUrl, getWebsite, sitePages } from "@/lib/website";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ pages }, siteUrl] = await Promise.all([getWebsite(), getSiteUrl()]);
  const paths = ["", "/policies", "/delete-account", ...sitePages(pages).map((page) => page.path)];
  return paths.map((path) => ({ url: `${siteUrl}${path}` }));
}
