import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { CategoryTabs } from "@/components/category-tabs";
import { HomeSections, shownSections } from "@/components/home-sections";
import { getHomeFeed, getSettings, getWebsite } from "@/lib/website";

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getWebsite();
  return { title: { absolute: business.appName } };
}

export default async function HomePage() {
  const [website, feed, settings] = await Promise.all([
    getWebsite(),
    getHomeFeed().catch(() => null),
    getSettings(),
  ]);
  const { business, tagline } = website;
  const sections = feed ? shownSections(feed) : [];
  const categoryTabs = feed?.categoryTabs ?? [];

  return (
    <div className="flex flex-col">
      {/* Mobile search bar (under header, matches app search field) */}
      <div className="border-b border-gray-100 bg-white p-3 md:hidden">
        <Link
          href="/search"
          className="flex h-11 items-center gap-2.5 rounded-full border border-gray-200 bg-gray-50/80 px-4 text-sm text-gray-400 active:bg-gray-100"
        >
          <Search className="size-4 text-gray-400" />
          <span>Search for products, brands…</span>
        </Link>
      </div>

      {/* Category Tabs (matches customer app's CategoryTabs) */}
      {categoryTabs.length > 0 && <CategoryTabs tabs={categoryTabs} />}

      {/* Sections or fallback welcome */}
      {sections.length > 0 ? (
        <div id="shop" className="flex flex-col">
          <HomeSections sections={sections} currency={settings.currency} />
        </div>
      ) : (
        <section className="bg-gradient-to-br from-primary to-primary-deep text-primary-foreground">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-5 py-16 sm:py-24">
            <h1 className="max-w-3xl text-4xl leading-tight font-extrabold sm:text-6xl">
              {tagline ?? `Discover ${business.name}`}
            </h1>
            <p className="max-w-2xl text-lg opacity-90">
              Explore the collection, find what you need, and have it delivered to your door.
            </p>
            <Link
              href="/search"
              className="inline-flex h-12 items-center rounded-full bg-white px-6 font-semibold text-neutral-900 shadow-md hover:opacity-90"
            >
              Browse products
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
