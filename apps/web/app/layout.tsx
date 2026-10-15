import type { Metadata } from "next";
import { headers } from "next/headers";
import { Plus_Jakarta_Sans } from "next/font/google";

import { BrandStyle } from "@/components/brand-style";
import { shownSections } from "@/components/home-sections";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getHomeFeed, getSiteUrl, getWebsite } from "@/lib/website";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const [{ business, tagline }, siteUrl] = await Promise.all([getWebsite(), getSiteUrl()]);
  const description = tagline ?? `Shop ${business.appName} online. Browse the collection and order for delivery.`;
  return {
    metadataBase: new URL(siteUrl),
    title: { template: `%s · ${business.appName}`, default: business.appName },
    description,
    applicationName: business.appName,
    icons: business.logoUrl ? { icon: business.logoUrl, apple: business.logoUrl } : undefined,
    openGraph: { type: "website", siteName: business.appName, title: business.appName, description, images: business.logoUrl ? [business.logoUrl] : undefined },
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render against the live deployment at request time; production images build without API access.
  await headers();
  const [website, feed] = await Promise.all([getWebsite(), getHomeFeed().catch(() => null)]);

  return (
    <html lang="en" className={`${sans.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <BrandStyle />
        <SiteHeader website={website} hasShop={feed !== null && shownSections(feed).length > 0} />
        <main className="flex flex-1 flex-col">{children}</main>
        <SiteFooter website={website} />
      </body>
    </html>
  );
}
