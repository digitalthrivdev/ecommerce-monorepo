import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import type { CategoryTab } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CategoryTabs({
  tabs = [],
  activeSlug,
}: {
  tabs?: CategoryTab[];
  activeSlug?: string | null;
}) {
  if (!tabs || tabs.length === 0) return null;

  return (
    <div className="w-full border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-4 py-2.5 scrollbar-none sm:px-6 sm:py-3">
        {/* "All" button */}
        <Link
          href="/"
          className={cn(
            "group relative flex shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-2xl px-3 py-1.5 transition-all sm:px-4",
            !activeSlug ? "text-primary font-bold" : "text-gray-600 hover:text-gray-900",
          )}
        >
          <div
            className={cn(
              "flex size-11 items-center justify-center rounded-2xl transition-all sm:size-12",
              !activeSlug
                ? "bg-primary/10 text-primary ring-2 ring-primary/20 shadow-xs"
                : "bg-gray-100 text-gray-500 group-hover:bg-gray-200/80 group-hover:text-gray-800",
            )}
          >
            <ShoppingBag className="size-5" />
          </div>
          <span className="text-xs font-semibold select-none sm:text-xs">All</span>
          {!activeSlug && (
            <span className="absolute bottom-0 h-0.5 w-6 rounded-full bg-primary" />
          )}
        </Link>

        {/* Categories */}
        {tabs.map((tab) => {
          const isActive = activeSlug === tab.category.slug;
          const href = `/c/${encodeURIComponent(tab.category.slug)}`;

          return (
            <Link
              key={tab.id}
              href={href}
              className={cn(
                "group relative flex shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-2xl px-3 py-1.5 transition-all sm:px-4",
                isActive ? "text-primary font-bold" : "text-gray-600 hover:text-gray-900",
              )}
            >
              <div
                className={cn(
                  "relative flex size-11 items-center justify-center overflow-hidden rounded-2xl transition-all sm:size-12",
                  isActive
                    ? "bg-primary/10 text-primary ring-2 ring-primary/20 shadow-xs"
                    : "bg-gray-100 text-gray-600 group-hover:bg-gray-200/80 group-hover:text-gray-900",
                )}
              >
                {tab.icon?.type === "image" && tab.icon.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tab.icon.url}
                    alt={tab.category.name}
                    className="size-full object-cover p-1"
                  />
                ) : (
                  <span className="text-sm font-extrabold sm:text-base">
                    {tab.category.name.charAt(0)}
                  </span>
                )}

                {tab.badge && (
                  <span className="absolute right-1 top-1 rounded-full bg-red-600 px-1.5 py-px text-[9px] font-black text-white">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="max-w-[70px] truncate text-xs font-semibold select-none sm:max-w-[85px]">
                {tab.category.name}
              </span>
              {isActive && (
                <span className="absolute bottom-0 h-0.5 w-6 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
