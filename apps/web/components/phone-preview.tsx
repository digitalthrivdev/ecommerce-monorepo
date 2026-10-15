import { Apple, Cookie, CupSoda, Home, LayoutGrid, Milk, Search, ShoppingBag, ShoppingCart, Sparkles, User, Wheat } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { CategoryImage } from "@/components/category-tile";
import type { HomeSection } from "@/lib/types";

/** Shown in the preview when Appearance has no categories yet. */
const SAMPLE_CATEGORIES = [
  { name: "Fruits", icon: Apple },
  { name: "Dairy", icon: Milk },
  { name: "Snacks", icon: Cookie },
  { name: "Drinks", icon: CupSoda },
  { name: "Staples", icon: Wheat },
  { name: "Home care", icon: Sparkles },
  { name: "Bakery", icon: ShoppingBag },
  { name: "More", icon: LayoutGrid },
];

function previewContent(sections: HomeSection[]) {
  const banner = sections.flatMap((section) => (section.type === "banner_carousel" ? section.banners : []))[0] ?? null;
  const categories = sections
    .flatMap((section) => {
      if (section.type === "category_grid" || section.type === "subcategory_grid") return section.categories.map((category) => ({ id: category.id, name: category.name, imageUrl: category.imageUrl }));
      if (section.type === "category_collection") return section.items.map((item) => ({ id: item.id, name: item.label, imageUrl: item.imageUrl ?? item.category.imageUrl }));
      return [];
    })
    .slice(0, 8);
  return { banner, categories };
}

/** A phone showing the app's home screen, built from the real Appearance content. */
export function PhonePreview({ appName, logoUrl, sections }: { appName: string; logoUrl: string | null; sections: HomeSection[] }) {
  const { banner, categories } = previewContent(sections);

  return (
    <div aria-hidden className="relative mx-auto w-[280px] select-none sm:w-[300px]">
      <div className="absolute -inset-10 -z-10 rounded-full bg-accent/40 blur-3xl" />
      <div className="rounded-[2.75rem] bg-neutral-900 p-2.5 shadow-2xl ring-1 ring-black/40">
        <div className="relative overflow-hidden rounded-[2.25rem] bg-white text-neutral-900">
          <div className="absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-neutral-900" />

          <div className="bg-primary px-4 pt-10 pb-4 text-primary-foreground">
            <div className="flex items-center gap-2">
              <BrandMark appName={appName} logoUrl={logoUrl} className="size-7 rounded-lg text-sm" />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-extrabold">{appName}</p>
                <p className="text-[10px] opacity-85">Delivering to Home</p>
              </div>
              <User className="ml-auto size-5 opacity-90" />
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-[11px] text-neutral-500">
              <Search className="size-3.5" />
              Search for milk, bread, fruits…
            </div>
          </div>

          <div className="flex flex-col gap-3 px-3 pt-3 pb-16">
            {banner ? (
              // eslint-disable-next-line @next/next/no-img-element -- banner images can be on any host
              <img src={banner.imageUrl} alt="" className="aspect-[2/1] w-full rounded-xl object-cover" />
            ) : (
              <div className="flex aspect-[2/1] w-full flex-col justify-center rounded-xl bg-accent px-4 text-accent-foreground">
                <p className="text-sm font-extrabold">Shop the collection</p>
                <p className="text-[11px] opacity-80">Delivered to your door</p>
              </div>
            )}
            <p className="px-1 text-xs font-bold">Shop by category</p>
            <div className="grid grid-cols-4 gap-x-2 gap-y-3">
              {categories.length > 0
                ? categories.map((category) => (
                    <div key={category.id} className="flex flex-col items-center gap-1">
                      <CategoryImage name={category.name} imageUrl={category.imageUrl} className="w-full rounded-xl" />
                      <span className="line-clamp-1 text-center text-[9px] font-semibold">{category.name}</span>
                    </div>
                  ))
                : SAMPLE_CATEGORIES.map(({ name, icon: Icon }) => (
                    <div key={name} className="flex flex-col items-center gap-1">
                      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
                        <Icon className="size-5" />
                      </div>
                      <span className="text-center text-[9px] font-semibold">{name}</span>
                    </div>
                  ))}
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 flex justify-around border-t bg-white px-4 pt-2 pb-4 text-neutral-400">
            <Home className="size-5 text-primary-ink" />
            <LayoutGrid className="size-5" />
            <ShoppingCart className="size-5" />
            <User className="size-5" />
          </div>
        </div>
      </div>
    </div>
  );
}
