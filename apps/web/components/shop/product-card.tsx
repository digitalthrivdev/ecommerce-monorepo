import Link from "next/link";
import { Package } from "lucide-react";

import { productPath } from "@/lib/paths";
import type { CatalogProduct } from "@/lib/types";
import { cardOffer, cn, formatMoney } from "@/lib/utils";

export function ProductCard({ product, currency }: { product: CatalogProduct; currency: string }) {
  const offer = product.variants.length > 0 ? cardOffer(product.variants) : null;

  return (
    <Link href={productPath(product.productId)} className="group flex flex-col gap-2">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-black/5">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- product images can be on any host
          <img src={product.imageUrl} alt="" className="size-full object-contain p-3 transition group-hover:scale-[1.02]" />
        ) : (
          <Package className="size-10 text-muted-foreground/40" aria-hidden />
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {product.brand && <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{product.brand.name}</p>}
        <p className="line-clamp-2 text-sm font-semibold leading-snug">{product.name}</p>
        {offer ? (
          <p className="text-sm">
            <span className="font-bold">{offer.varies ? `From ${formatMoney(offer.price, currency)}` : formatMoney(offer.price, currency)}</span>
            {offer.compareAtPrice && <span className="ml-2 text-muted-foreground line-through">{formatMoney(offer.compareAtPrice, currency)}</span>}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Unavailable</p>
        )}
        {offer && !offer.inStock && <p className="text-xs font-medium text-red-700">Out of stock</p>}
        {product.rating && (
          <p className="text-xs text-muted-foreground">
            {product.rating.average} · {product.rating.count} {product.rating.count === 1 ? "review" : "reviews"}
          </p>
        )}
      </div>
    </Link>
  );
}

export function ProductGrid({ products, currency, className }: { products: CatalogProduct[]; currency: string; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {products.map((product) => (
        <li key={product.productId}>
          <ProductCard product={product} currency={currency} />
        </li>
      ))}
    </ul>
  );
}
