import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShoppingBasket } from "lucide-react";

import { AppBadges } from "@/components/app-badges";
import type { ProductPreview } from "@/lib/types";
import { formatMoney } from "@/lib/utils";
import { getProductPreview, getSettings, getWebsite } from "@/lib/website";

function priceText(price: NonNullable<ProductPreview["price"]>, currency: string) {
  const amount = formatMoney(price.sellingPrice, currency);
  return price.varies ? `From ${amount}` : amount;
}

export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const [product, { business }, settings] = await Promise.all([getProductPreview((await params).id), getWebsite(), getSettings()]);
  if (!product) return { title: "Product not found" };

  const offer = product.price ? `${priceText(product.price, settings.currency)} on ${business.appName}` : `On ${business.appName}`;
  const description = product.description ? `${offer}. ${product.description}`.slice(0, 200) : `${offer}, delivered to your door.`;
  const images = product.imageUrl ? [product.imageUrl] : business.logoUrl ? [business.logoUrl] : undefined;
  return {
    title: product.name,
    description,
    alternates: { canonical: `/p/${product.id}` },
    openGraph: { type: "website", siteName: business.appName, title: product.name, description, url: `/p/${product.id}`, images },
    twitter: { card: product.imageUrl ? "summary_large_image" : "summary", title: product.name, description, images },
  };
}

export default async function ProductPage({ params }: PageProps<"/p/[id]">) {
  const [product, { business, apps }, settings] = await Promise.all([getProductPreview((await params).id), getWebsite(), getSettings()]);
  if (!product) notFound();

  const { price } = product;
  const showMrp = price?.mrp && Number(price.mrp) > Number(price.sellingPrice);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-10 sm:py-14 md:grid-cols-2 md:gap-12">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-3xl border bg-white shadow-sm">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- product images can be on any host
          <img src={product.imageUrl} alt={product.name} className="size-full object-contain p-6" />
        ) : (
          <ShoppingBasket className="size-24 text-muted-foreground/40" aria-hidden />
        )}
      </div>

      <div className="flex flex-col gap-5">
        <div>
          {product.brand && <p className="text-sm font-semibold tracking-wider text-primary-ink uppercase">{product.brand}</p>}
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{product.name}</h1>
        </div>

        {price ? (
          <div className="flex flex-col gap-1">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-3xl font-bold">{priceText(price, settings.currency)}</span>
              {showMrp && <span className="text-lg text-muted-foreground line-through">{formatMoney(price.mrp!, settings.currency)}</span>}
            </p>
            {price.label && <p className="text-sm text-muted-foreground">{price.label}</p>}
            {price.varies && <p className="text-sm text-muted-foreground">Prices depend on the pack and your nearest store.</p>}
          </div>
        ) : (
          <p className="text-lg font-semibold text-muted-foreground">Currently unavailable</p>
        )}

        {apps.customer && (
          <div className="flex flex-col gap-3 rounded-2xl border bg-primary-soft p-5">
            <p className="font-semibold">Order it on the {business.appName} app</p>
            <AppBadges links={apps.customer} appName={business.appName} />
          </div>
        )}

        {product.description && <p className="leading-relaxed whitespace-pre-line text-muted-foreground">{product.description}</p>}
      </div>
    </div>
  );
}
