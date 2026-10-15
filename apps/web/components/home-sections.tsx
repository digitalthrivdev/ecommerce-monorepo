import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { CategoryTile } from "@/components/category-tile";
import { ProductGrid } from "@/components/shop/product-card";
import type { HomeFeed, HomeLink, SectionBackground } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEB_SECTION_TYPES = new Set<string>(["banner_carousel", "category_grid", "subcategory_grid", "category_collection", "image_tiles", "offer_strip", "product_rail", "deals_rail", "brand_rail", "category_deals", "sale_hero"]);

function linkHref(link: HomeLink) {
  return link.type === "category" ? `/c/${encodeURIComponent(link.category.slug)}` : null;
}

function Linked({ link, children }: { link: HomeLink; children: ReactNode }) {
  const href = linkHref(link);
  return href ? <Link href={href} className="block">{children}</Link> : <>{children}</>;
}

/** The home sections from Appearance that the website can show, in the admin's order. */
export function shownSections(feed: HomeFeed) {
  return feed.sections.filter((section) => WEB_SECTION_TYPES.has(section.type));
}

function Band({ background, children }: { background: SectionBackground; children: ReactNode }) {
  if (!background) return <section className="mx-auto w-full max-w-6xl px-5 py-8">{children}</section>;
  const style = { backgroundColor: background.color, color: background.textColor } satisfies CSSProperties;
  return (
    <section style={style} className="w-full">
      <div className="mx-auto w-full max-w-6xl px-5 py-10">{children}</div>
    </section>
  );
}

function Heading({ title, description, tinted }: { title: string | null; description: string | null; tinted: boolean }) {
  if (!title && !description) return null;
  return (
    <div className="mb-6">
      {title && <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>}
      {description && <p className={cn("mt-1.5", tinted ? "opacity-85" : "text-muted-foreground")}>{description}</p>}
    </div>
  );
}

function Rail({ children }: { children: ReactNode }) {
  return <div className="scrollbar-none -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-5 px-5 pb-2">{children}</div>;
}

function SectionContent({ section, currency }: { section: HomeFeed["sections"][number]; currency: string }) {
  const tinted = section.background !== null;

  switch (section.type) {
    case "banner_carousel": {
      const single = section.banners.length === 1;
      return (
        <Rail>
          {section.banners.map((banner) => (
            <Linked key={banner.id} link={banner.link}><figure
              key={banner.id}
              className={cn(
                "relative shrink-0 snap-start overflow-hidden rounded-3xl bg-muted shadow-sm ring-1 ring-black/5",
                single ? "aspect-[2/1] max-h-80 w-full sm:aspect-[3/1]" : "aspect-[2/1] w-[85%] sm:w-[calc(50%-0.5rem)]",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- banner images can be on any host */}
              <img src={banner.imageUrl} alt={banner.title ?? ""} loading="lazy" className="size-full object-cover" />
              {(banner.title || banner.subtitle) && (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 text-white">
                  {banner.title && <p className="text-lg font-bold sm:text-2xl">{banner.title}</p>}
                  {banner.subtitle && <p className="text-sm opacity-90 sm:text-base">{banner.subtitle}</p>}
                </figcaption>
              )}
            </figure></Linked>
          ))}
        </Rail>
      );
    }

    case "category_grid":
    case "subcategory_grid":
      return (
        <>
          <Heading title={section.title} description={section.description} tinted={tinted} />
          <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {section.categories.map((category) => (
              <Link key={category.id} href={`/c/${encodeURIComponent(category.slug)}`}><CategoryTile name={category.name} imageUrl={category.imageUrl} /></Link>
            ))}
          </div>
        </>
      );

    case "category_collection":
      return (
        <>
          <Heading title={section.title} description={section.description} tinted={tinted} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
            {section.items.map((item) => (
              <Link key={item.id} href={`/c/${encodeURIComponent(item.category.slug)}`}><CategoryTile name={item.label} imageUrl={item.imageUrl ?? item.category.imageUrl} badge={item.badge} /></Link>
            ))}
          </div>
        </>
      );

    case "image_tiles": {
      const tiles = section.tiles.map((tile) => (
        <Linked key={tile.id} link={tile.link}><div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-muted shadow-sm ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element -- tile images can be on any host */}
          <img src={tile.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
          {tile.buttonLabel && (
            <span className="absolute bottom-3 left-3 rounded-full bg-white px-3 py-1 text-sm font-semibold text-black shadow">{tile.buttonLabel}</span>
          )}
        </div></Linked>
      ));
      return (
        <>
          <Heading title={section.title} description={section.description} tinted={tinted} />
          {section.layout === "carousel" ? (
            <Rail>
              {tiles.map((tile) => (
                <div key={tile.key} className="w-[70%] shrink-0 snap-start sm:w-[calc(33.333%-0.7rem)]">
                  {tile}
                </div>
              ))}
            </Rail>
          ) : (
            <div className={cn("grid grid-cols-2 gap-4", section.columns === 3 ? "md:grid-cols-3" : "md:grid-cols-4")}>{tiles}</div>
          )}
        </>
      );
    }

    case "offer_strip":
      return (
        <div
          style={{ backgroundColor: section.backgroundColor, color: section.textColor }}
          className="flex items-center gap-5 overflow-hidden rounded-3xl px-6 py-6 shadow-sm sm:px-10"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xl font-bold sm:text-2xl">{section.title}</p>
            {section.subtitle && <p className="mt-1 opacity-85">{section.subtitle}</p>}
          </div>
          <div className="flex items-center gap-5">{section.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- offer images can be on any host
            <img src={section.imageUrl} alt="" loading="lazy" className="h-20 w-auto shrink-0 object-contain sm:h-24" />
          )}{linkHref(section.link) && <Link href={linkHref(section.link)!} className="shrink-0 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold">Shop now</Link>}</div>
        </div>
      );
    case "product_rail":
    case "deals_rail":
      return <><Heading title={section.title} description={section.description} tinted={tinted}/><ProductGrid products={section.products} currency={currency}/></>;
    case "brand_rail":
      return <><Heading title={section.title} description={section.description} tinted={tinted}/><div className="flex flex-wrap gap-3">{section.brands.map(brand=><Link key={brand.id} href={`/search?brand=${encodeURIComponent(brand.id)}`} className="rounded-full border bg-card px-4 py-2 font-semibold hover:border-primary">{brand.name}</Link>)}</div></>;
    case "category_deals":
      return <><Heading title={section.title} description={section.description} tinted={tinted}/><div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-6">{section.categories.map(category=><Link key={category.id} href={`/c/${encodeURIComponent(category.slug)}`}><CategoryTile name={category.name} imageUrl={category.imageUrl} badge={`${category.maxDiscountPercent}% off`}/></Link>)}</div></>;
    case "sale_hero":
      return <><div className="mb-6 rounded-3xl bg-primary px-6 py-8 text-primary-foreground"><h2 className="text-3xl font-extrabold">{section.title}</h2>{section.subtitle&&<p className="mt-2">{section.subtitle}</p>}{section.tagline&&<p className="mt-1 opacity-85">{section.tagline}</p>}</div>{section.deals&&<><h3 className="mb-4 text-xl font-bold">{section.deals.label}</h3><ProductGrid products={section.deals.products} currency={currency}/></>}<div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4">{section.categories.map(category=><Link key={category.id} href={`/c/${encodeURIComponent(category.slug)}`}><CategoryTile name={category.name} imageUrl={category.imageUrl} badge={category.maxDiscountPercent ? `${category.maxDiscountPercent}% off`:null}/></Link>)}</div></>;
    case "buy_again":
      return <Heading title={section.title ?? "Buy again"} description={section.description} tinted={tinted}/>;
  }
}

/** The app's home screen sections from Appearance, laid out for the web. */
export function HomeSections({ sections, currency }: { sections: HomeFeed["sections"]; currency: string }) {
  return (
    <>
      {sections.map((section) => (
        <Band key={section.id} background={section.background}>
          <SectionContent section={section} currency={currency}/>
        </Band>
      ))}
    </>
  );
}
