import { createElement } from "react";
import { Package } from "lucide-react";

import { cn } from "@/lib/utils";

/** A category's photo, or a neutral product icon on a soft brand tint when it has none. */
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
        <img src={imageUrl} alt={name} loading="lazy" className="size-full object-cover" />
      ) : (
        createElement(Package, { "aria-hidden": true, className: "size-[38%] text-primary-ink/80", strokeWidth: 1.6 })
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
