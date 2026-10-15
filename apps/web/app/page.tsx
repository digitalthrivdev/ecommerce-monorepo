import type { Metadata } from "next";
import Link from "next/link";

import { HomeSections, shownSections } from "@/components/home-sections";
import { getHomeFeed, getSettings, getWebsite } from "@/lib/website";

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getWebsite();
  return { title: { absolute: business.appName } };
}

export default async function HomePage() {
  const [website, feed, settings] = await Promise.all([getWebsite(), getHomeFeed().catch(() => null), getSettings()]);
  const { business, tagline } = website;
  const sections = feed ? shownSections(feed) : [];

  return (
    <>
      <section className="bg-gradient-to-br from-primary to-primary-deep text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-5 py-16 sm:py-24">
          <h1 className="max-w-3xl text-4xl leading-tight font-extrabold sm:text-6xl">{tagline ?? `Discover ${business.name}`}</h1>
          <p className="max-w-2xl text-lg opacity-90">Explore the collection, find what you need, and have it delivered to your door.</p>
          <Link href="/search" className="inline-flex h-12 items-center rounded-full bg-white px-6 font-semibold text-neutral-900 shadow-md hover:opacity-90">Browse products</Link>
        </div>
      </section>

      {sections.length > 0 && (
        <div id="shop" className="flex scroll-mt-16 flex-col pt-8">
          <HomeSections sections={sections} currency={settings.currency} />
        </div>
      )}

    </>
  );
}
