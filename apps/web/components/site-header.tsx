import Link from "next/link";
import { Search, ShoppingCart, UserRound } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import type { Website } from "@/lib/types";

export function SiteHeader({ website, hasShop }: { website: Website; hasShop: boolean }) {
  const { business } = website;

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2.5 font-bold">
          <BrandMark appName={business.appName} logoUrl={business.logoUrl} />
          <span className="text-lg tracking-tight">{business.appName}</span>
        </Link>
        <nav aria-label="Main" className="ml-auto flex items-center gap-3 text-sm font-medium text-muted-foreground md:gap-5">
          {hasShop && (
            <Link href="/#shop" className="hover:text-foreground">
              Shop
            </Link>
          )}
          <Link href="/search" aria-label="Search products" className="inline-flex items-center gap-1 hover:text-foreground"><Search className="size-4"/> <span className="hidden sm:inline">Search</span></Link>
          <Link href="/cart" aria-label="Shopping cart" className="inline-flex items-center gap-1 hover:text-foreground"><ShoppingCart className="size-4"/> <span className="hidden sm:inline">Cart</span></Link>
          <Link href="/account" className="inline-flex items-center gap-1 hover:text-foreground"><UserRound className="size-4"/> <span className="hidden sm:inline">Account</span></Link>
        </nav>
      </div>
    </header>
  );
}
