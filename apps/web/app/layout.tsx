import type { Metadata } from "next";
import { headers } from "next/headers";
import { Plus_Jakarta_Sans } from "next/font/google";

import { AnnouncementBar } from "@/components/announcement-bar";
import { BrandStyle } from "@/components/brand-style";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCart } from "@/lib/catalog";
import { getHomeFeed, getSettings, getSiteUrl, getWebsite } from "@/lib/website";
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
  const [website, settings, cart] = await Promise.all([
    getWebsite(),
    getSettings(),
    getCart().catch(() => ({ itemCount: 0, subtotal: "0.00" })),
  ]);

  return (
    <html lang="en" className={`${sans.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-background text-foreground antialiased">
        <BrandStyle />
        <AnnouncementBar announcement={settings.announcement} />
        <SiteHeader website={website} cartCount={cart.itemCount} currency={settings.currency} />
        <main className="flex flex-1 flex-col">{children}</main>
        <SiteFooter website={website} />
      </body>
    </html>
  );
}
