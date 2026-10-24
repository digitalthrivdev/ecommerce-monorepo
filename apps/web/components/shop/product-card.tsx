import Link from "next/link";
import { Package, Star } from "lucide-react";

import { productPath } from "@/lib/paths";
import type { CatalogProduct } from "@/lib/types";
import { cardOffer, cn, formatMoney } from "@/lib/utils";

function discountPercent(price: string, compareAtPrice: string | null | undefined): number | null {
  if (!compareAtPrice) return null;
  const p = Number(price);
  const c = Number(compareAtPrice);
  if (!Number.isFinite(p) || !Number.isFinite(c) || c <= p) return null;
  return Math.round(((c - p) / c) * 100);
}

export function ProductCard({
  product,
  currency,
  className,
}: {
  product: CatalogProduct;
  currency: string;
  className?: string;
}) {
  const offer = product.variants.length > 0 ? cardOffer(product.variants) : null;
  const primaryVariant = product.variants[0];
  const discount = offer ? discountPercent(offer.price, offer.compareAtPrice) : null;
  const isSoldOut = !offer || !offer.inStock;
  const variantLabel = primaryVariant?.label;

  return (
    <Link
      href={productPath(product.slug || product.productId)}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-2.5 transition-all duration-200 hover:border-gray-300 hover:shadow-md",
        className,
      )}
    >
      {/* Image Container with Badges */}
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gray-50/50">
        <div className={cn("size-full items-center justify-center flex", isSoldOut && "opacity-40")}>
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- product images can be on any host
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              className="size-full object-contain p-3 transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <Package className="size-10 text-muted-foreground/40" aria-hidden />
          )}
        </div>

        {/* Discount Ribbon */}
        {discount && !isSoldOut && (
          <span className="absolute left-1.5 top-1.5 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-xs">
            {discount}% OFF
          </span>
        )}

        {/* Sold out overlay */}
        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
            <span className="rounded-lg bg-black/85 px-2.5 py-1 text-[11px] font-bold text-white shadow-md">
              Out of stock
            </span>
          </div>
        )}

        {/* Variant label tag */}
        {variantLabel && !isSoldOut && (
          <span className="absolute bottom-1.5 left-1.5 max-w-[70%] truncate rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
            {variantLabel}
          </span>
        )}
      </div>

      {/* Product Details */}
      <div className="mt-2.5 flex flex-col gap-1 px-1">
        {/* Brand */}
        {product.brand && (
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {product.brand.name}
          </p>
        )}

        {/* Pricing */}
        {offer ? (
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="text-sm font-extrabold text-gray-900 sm:text-base">
              {offer.varies ? `From ${formatMoney(offer.price, currency)}` : formatMoney(offer.price, currency)}
            </span>
            {offer.compareAtPrice && (
              <span className="text-xs text-gray-400 line-through">
                {formatMoney(offer.compareAtPrice, currency)}
              </span>
            )}
            {discount && (
              <span className="text-[11px] font-bold text-emerald-600 sm:inline hidden">
                {discount}% OFF
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Unavailable</p>
        )}

        {/* Product Name */}
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-gray-900 group-hover:text-primary transition-colors sm:text-sm">
          {product.name}
        </p>

        {/* Rating */}
        {product.rating && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px]">
            <span className="flex items-center gap-0.5 font-bold text-amber-500">
              <Star className="size-3 fill-amber-400 stroke-amber-500" />
              {Number(product.rating.average).toFixed(1)}
            </span>
            <span className="text-gray-400">({product.rating.count})</span>
          </div>
        )}
      </div>
    </Link>
  );
}

export function ProductGrid({
  products,
  currency,
  className,
}: {
  products: CatalogProduct[];
  currency: string;
  className?: string;
}) {
  return (
    <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 sm:gap-4", className)}>
      {products.map((product) => (
        <li key={product.productId}>
          <ProductCard product={product} currency={currency} />
        </li>
      ))}
    </ul>
  );
}
