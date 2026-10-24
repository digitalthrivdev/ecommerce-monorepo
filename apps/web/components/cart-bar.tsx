import Link from "next/link";
import { ChevronRight, ShoppingBag } from "lucide-react";

import { formatMoney } from "@/lib/utils";

type Props = {
  itemCount: number;
  subtotal: string;
  currency: string;
};

export function CartBar({ itemCount, subtotal, currency }: Props) {
  if (itemCount <= 0) return null;

  return (
    <aside
      aria-label="Cart summary"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white/95 p-3 backdrop-blur-md shadow-2xl sm:hidden"
    >
      <Link
        href="/cart"
        className="flex h-13 w-full items-center justify-between rounded-2xl bg-primary px-4 text-primary-foreground shadow-md transition-all active:scale-[0.99]"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-white/20">
            <ShoppingBag className="size-5" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-bold leading-tight">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
            <span className="text-sm font-extrabold leading-tight">
              {formatMoney(subtotal, currency)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 font-bold text-sm">
          <span>View Cart</span>
          <ChevronRight className="size-4" />
        </div>
      </Link>
    </aside>
  );
}
