import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/website";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getSiteUrl();
  return { rules: { userAgent: "*", allow: "/", disallow: ["/app", "/account", "/cart", "/checkout", "/signin"] }, sitemap: `${siteUrl}/sitemap.xml` };
}
