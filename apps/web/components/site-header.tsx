import Link from "next/link";
import { Search, ShoppingBag, UserRound } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { QuickSearch } from "@/components/quick-search";
import type { Website } from "@/lib/types";

type Props = {
  website: Website;
  cartCount?: number;
  currency?: string;
};

export function SiteHeader({ website, cartCount = 0, currency = "INR" }: Props) {
  const { business } = website;

  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur-md transition-all">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 font-bold shrink-0">
          <BrandMark appName={business.appName} logoUrl={business.logoUrl} />
          <span className="text-lg font-black tracking-tight text-gray-900 sm:text-xl">
            {business.appName}
          </span>
        </Link>

        {/* Instant Search Bar (visible on md screens and up) */}
        <div className="hidden max-w-md flex-1 md:block">
          <QuickSearch currency={currency} />
        </div>

        {/* Right Navigation */}
        <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-3">
          {/* Mobile search icon */}
          <Link
            href="/search"
            aria-label="Search products"
            className="flex size-10 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 md:hidden"
          >
            <Search className="size-5" />
          </Link>

          {/* Cart Icon with Counter Badge */}
          <Link
            href="/cart"
            aria-label="Shopping cart"
            className="relative flex h-10 items-center gap-1.5 rounded-full px-3 text-gray-700 transition hover:bg-gray-100 hover:text-gray-900"
          >
            <div className="relative flex items-center justify-center">
              <ShoppingBag className="size-5" />
              {cartCount > 0 && (
                <span className="absolute -right-2 -top-2 flex size-4.5 items-center justify-center rounded-full bg-primary text-[10px] font-black text-primary-foreground shadow-xs animate-in zoom-in-75">
                  {cartCount}
                </span>
              )}
            </div>
            <span className="hidden text-xs font-bold sm:inline">Cart</span>
          </Link>

          {/* Account Icon */}
          <Link
            href="/account"
            aria-label="Account"
            className="flex size-10 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 hover:text-gray-900"
          >
            <UserRound className="size-5" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
