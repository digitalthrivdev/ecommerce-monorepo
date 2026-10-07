import { createElement } from "react";
import {
  Apple,
  Baby,
  Beef,
  Cookie,
  Croissant,
  CupSoda,
  Egg,
  Fish,
  IceCreamCone,
  Leaf,
  type LucideIcon,
  Milk,
  PawPrint,
  ShoppingBasket,
  Snowflake,
  Sparkles,
  SprayCan,
  Wheat,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** Picks an icon from the category's name for categories without a photo; the basket when nothing matches. */
const ICON_RULES: [RegExp, LucideIcon][] = [
  [/fruit|apple|banana|mango/i, Apple],
  [/veg|green|herb|leaf|organic/i, Leaf],
  [/dairy|milk|curd|paneer|cheese|butter|breakfast/i, Milk],
  [/egg/i, Egg],
  [/bread|bakery|bake|cake|biscuit/i, Croissant],
  [/snack|chips|namkeen|chocolate|sweet|cookie/i, Cookie],
  [/ice ?cream|dessert/i, IceCreamCone],
  [/frozen/i, Snowflake],
  [/drink|beverage|juice|tea|coffee|water|soda/i, CupSoda],
  [/staple|atta|rice|dal|flour|grain|oil|masala|spice/i, Wheat],
  [/meat|chicken|mutton/i, Beef],
  [/fish|sea ?food/i, Fish],
  [/baby|kid/i, Baby],
  [/pet/i, PawPrint],
  [/clean|household|home|laundry|detergent/i, SprayCan],
  [/care|beauty|bath|body|hair|skin|oral|personal|hygiene/i, Sparkles],
];

const iconFor = (name: string) => ICON_RULES.find(([pattern]) => pattern.test(name))?.[1] ?? ShoppingBasket;

/** A category's photo, or an icon matching its name on a soft brand tint when it has none. */
export function CategoryImage({ name, imageUrl, className }: { name: string; imageUrl: string | null; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary-soft to-white",
        className,
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- category images can be on any host
        <img src={imageUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        createElement(iconFor(name), { "aria-hidden": true, className: "size-[38%] text-primary-ink/80", strokeWidth: 1.6 })
      )}
    </div>
  );
}

export function CategoryTile({ name, imageUrl, badge }: { name: string; imageUrl: string | null; badge?: string | null }) {
  return (
    <div className="group flex flex-col gap-2.5">
      <div className="relative">
        <CategoryImage name={name} imageUrl={imageUrl} className="ring-1 ring-black/5 transition group-hover:-translate-y-0.5 group-hover:shadow-md" />
        {badge && (
          <span className="absolute top-2 left-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground shadow-sm">{badge}</span>
        )}
      </div>
      <span className="text-center text-sm leading-tight font-semibold">{name}</span>
    </div>
  );
}
