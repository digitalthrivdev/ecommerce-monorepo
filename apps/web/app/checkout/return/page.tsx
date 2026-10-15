import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Payment update", robots: { index: false, follow: false } };
export default async function CheckoutReturnPage({ searchParams }: PageProps<"/checkout/return">) {
  const params = await searchParams;
  const status = params.status ?? params.payment_status ?? "";
  const failed = ["failed", "failure", "cancelled"].includes((Array.isArray(status) ? status[0] : status).toLowerCase());
  return <section className="mx-auto w-full max-w-xl px-5 py-16 text-center"><h1 className="text-3xl font-bold">{failed ? "Payment wasn’t completed" : "Payment update received"}</h1><p className="mt-3 text-muted-foreground">Check your order status for the latest payment information.</p><div className="mt-6 flex justify-center gap-3"><Link href="/account/orders" className="rounded-full bg-primary px-5 py-3 font-semibold text-primary-foreground">View orders</Link><Link href="/search" className="rounded-full border px-5 py-3 font-semibold">Continue shopping</Link></div></section>;
}
