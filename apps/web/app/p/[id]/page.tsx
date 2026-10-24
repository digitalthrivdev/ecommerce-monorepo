import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { ActionForm, SubmitButton } from "@/components/shop/action-form";
import { PincodeCheck } from "@/components/shop/pincode-check";
import { ProductGallery } from "@/components/shop/product-gallery";
import { VariantPurchase } from "@/components/shop/variant-purchase";
import { reviewProduct, saveWishlist } from "@/lib/actions";
import { getCatalogProduct, listAddresses, productReviews } from "@/lib/catalog";
import { productPath } from "@/lib/paths";
import { specificationsOf, formatDate, formatMoney, cardOffer } from "@/lib/utils";
import { findVariantFromParams } from "@/lib/variants";
import { getSettings, getSiteUrl } from "@/lib/website";
import { getCustomer } from "@/lib/session";

type Props = PageProps<"/p/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [product, settings] = await Promise.all([getCatalogProduct((await params).id), getSettings()]);
  if (!product) return { title: "Product not found" };
  const offer = product.variants.length ? `From ${formatMoney(cardOffer(product.variants).price, settings.currency)}` : "";
  const description = (product.description || `${product.name} ${offer}`).slice(0, 200);
  const canonical = productPath(product.slug || product.productId);
  return {
    title: product.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: product.name,
      description,
      images: product.imageUrl ? [product.imageUrl] : undefined,
    },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { id } = await params;
  const search = (await searchParams) ?? {};
  const [product, settings, reviews, siteUrl, customer] = await Promise.all([
    getCatalogProduct(id),
    getSettings(),
    productReviews(id).catch(() => null),
    getSiteUrl(),
    getCustomer(),
  ]);
  if (!product) notFound();

  const canonicalPath = productPath(product.slug || product.productId);
  const matchedVariant = findVariantFromParams(product.variants, product.options, search);
  const addresses = customer ? await listAddresses().then((r) => r.items).catch(() => []) : [];
  const images = product.images.length ? product.images : product.imageUrl ? [{ id: "primary", url: product.imageUrl, altText: product.name, variantId: null }] : [];
  const specs = specificationsOf(product.specifications);
  const offer = product.variants.length ? cardOffer(product.variants) : null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: images.map((image) => image.url),
    description: product.description ?? undefined,
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    offers: offer === null ? undefined : {
      "@type": "AggregateOffer",
      priceCurrency: settings.currency,
      lowPrice: offer.price,
      offerCount: product.variants.length,
      availability: offer.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${siteUrl}${canonicalPath}`,
    },
  };

  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}/>
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:py-14 md:grid-cols-2 md:gap-12">
      <ProductGallery images={images} productName={product.name} />
      <div className="flex flex-col gap-5">
        <div>
          <Link className="text-sm text-primary-ink hover:underline" href={`/c/${encodeURIComponent(product.category.slug)}`}>
            {product.category.name}
          </Link>
          {product.brand && <p className="mt-2 text-sm font-semibold uppercase text-muted-foreground">{product.brand.name}</p>}
          <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{product.name}</h1>
        </div>
        {product.variants.length ? (
          <VariantPurchase
            variants={product.variants}
            options={product.options}
            productName={product.name}
            productImage={images[0]?.url}
            currency={settings.currency}
            customer={customer}
            savedAddresses={addresses}
            initialVariantId={matchedVariant?.variantId}
            productSlug={product.slug}
          />
        ) : (
          <p className="font-semibold text-muted-foreground">Currently unavailable</p>
        )}
        {customer ? (
          <form action={saveWishlist}>
            <input type="hidden" name="productId" value={product.productId}/>
            <input type="hidden" name="saved" value="false"/>
            <button className="self-start rounded-full border px-4 py-2 text-sm font-semibold hover:border-primary">Save to wishlist</button>
          </form>
        ) : (
          <Link className="self-start text-sm underline" href={`/signin?next=${encodeURIComponent(canonicalPath)}`}>
            Sign in to save to wishlist
          </Link>
        )}
        <PincodeCheck/>
        {product.description && <div className="leading-relaxed whitespace-pre-line">{product.description}</div>}
        {product.manufacturerName && <p className="text-sm text-muted-foreground">Manufacturer: {product.manufacturerName}{product.manufacturerAddress ? ` · ${product.manufacturerAddress}` : ""}</p>}
        {product.countryOfOrigin && <p className="text-sm text-muted-foreground">Country of origin: {product.countryOfOrigin}</p>}
        {specs.length > 0 && <section><h2 className="mb-2 text-xl font-bold">Specifications</h2><dl className="divide-y rounded-2xl border px-4">{specs.map((item, index) => <div key={`${item.name}-${index}`} className="grid grid-cols-2 gap-3 py-3 text-sm"><dt className="text-muted-foreground">{item.name}</dt><dd className="font-medium">{item.value}</dd></div>)}</dl></section>}
        <section className="border-t pt-5"><h2 className="text-xl font-bold">Customer reviews {reviews ? `(${reviews.count})` : ""}</h2>{reviews?.items.map((item) => <article key={item.id} className="border-b py-4"><p className="font-semibold">{item.name} · {"★".repeat(item.rating)}{"☆".repeat(5-item.rating)}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(item.updatedAt, settings.timezone)}{item.verified ? " · Verified purchase" : ""}</p>{item.comment && <p className="mt-2 whitespace-pre-line">{item.comment}</p>}</article>)}{customer ? <div className="mt-5"><h3 className="mb-2 font-semibold">Write a review</h3><ActionForm action={reviewProduct} className="grid gap-3"><input type="hidden" name="productId" value={product.productId}/><label className="grid gap-1 text-sm">Rating<select name="rating" required className="h-11 rounded-xl border bg-white px-3">{[5,4,3,2,1].map((n)=><option key={n} value={n}>{n} stars</option>)}</select></label><label className="grid gap-1 text-sm">Comment<textarea name="comment" maxLength={2000} rows={3} className="rounded-xl border p-3"/></label><SubmitButton>Submit review</SubmitButton></ActionForm></div> : <p className="mt-4 text-sm"><Link className="underline" href={`/signin?next=${encodeURIComponent(canonicalPath)}`}>Sign in</Link> to write a review.</p>}</section>
      </div>
    </div>
  </>;
}
