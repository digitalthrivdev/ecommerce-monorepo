import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { saveWishlist } from "@/lib/actions";
import { listWishlist } from "@/lib/catalog";
import { getCustomer } from "@/lib/session";
import { getSettings } from "@/lib/website";
import { ProductGrid } from "@/components/shop/product-card";

export const metadata: Metadata = { title: "Your wishlist", robots: { index: false, follow: false } };
export default async function WishlistPage(){if(!(await getCustomer()))redirect(`/signin?next=${encodeURIComponent("/account/wishlist")}`);const [wishlist,settings]=await Promise.all([listWishlist(),getSettings()]);const products=wishlist.items.flatMap(item=>item.product?[item.product]:[]);return <section className="mx-auto w-full max-w-6xl px-5 py-10"><h1 className="mb-6 text-3xl font-bold">Your wishlist</h1>{wishlist.items.length?<><ProductGrid products={products} currency={settings.currency}/><div className="mt-6 flex flex-wrap gap-3">{wishlist.items.map(item=><form key={item.productId} action={saveWishlist}><input type="hidden" name="productId" value={item.productId}/><input type="hidden" name="saved" value="true"/><button className="rounded-full border px-4 py-2 text-sm">Remove {item.name}</button></form>)}</div></>:<p className="rounded-2xl border p-8 text-center text-muted-foreground">Your wishlist is empty.</p>}</section>}
