import Link from "next/link";
import { Smartphone } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import type { Website } from "@/lib/types";

export function SiteHeader({ website, hasShop }: { website: Website; hasShop: boolean }) {
  const { business, apps } = website;

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2.5 font-bold">
          <BrandMark appName={business.appName} logoUrl={business.logoUrl} />
          <span className="text-lg tracking-tight">{business.appName}</span>
        </Link>
        <nav aria-label="Main" className="ml-auto hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
          {hasShop && (
            <Link href="/#shop" className="hover:text-foreground">
              Shop
            </Link>
          )}
          <Link href="/#how-it-works" className="hover:text-foreground">
            How it works
          </Link>
          <Link href="/contact" className="hover:text-foreground">
            Contact
          </Link>
        </nav>
        {apps.customer ? (
          <Link
            href="/#download"
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 md:ml-0"
          >
            <Smartphone className="size-4" aria-hidden />
            Get the app
          </Link>
        ) : (
          <Link href="/contact" className="ml-auto text-sm font-medium text-muted-foreground hover:text-foreground md:hidden">
            Contact
          </Link>
        )}
      </div>
    </header>
  );
}
