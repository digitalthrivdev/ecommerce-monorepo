import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PageTab = { id: string; label: string; href: string; badge?: ReactNode };

/** Tabs as links, so the chosen tab survives a refresh and can be shared. */
export function PageTabs({ tabs, active, label }: { tabs: PageTab[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6">
      <ul className="flex w-max gap-1 border-b">
        {tabs.map((tab) => {
          const current = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors",
                  current ? "border-primary text-primary-ink" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {tab.badge}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
