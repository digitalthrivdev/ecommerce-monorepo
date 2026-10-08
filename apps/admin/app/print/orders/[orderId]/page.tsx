import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PrintOnLoad } from "@/components/orders/print-on-load";
import { Button } from "@/components/ui/button";
import { getCurrentUser, getPublicSettings } from "@/lib/dal";
import { formatDateTime, formatMoney } from "@/lib/format";
import { getOrder } from "@/lib/orders";

export async function generateMetadata({ params }: PageProps<"/print/orders/[orderId]">): Promise<Metadata> {
  const { orderId } = await params;
  const order = await getOrder(await getCurrentUser(), orderId);
  return { title: `Packing slip ${order.orderNumber}` };
}

/** A plain packing slip to print and put in the bag. Not a tax invoice: the shop's GSTIN isn't stored. */
export default async function PackingSlipPage({ params }: PageProps<"/print/orders/[orderId]">) {
  const { orderId } = await params;
  const user = await getCurrentUser();
  const [order, settings] = await Promise.all([getOrder(user, orderId), getPublicSettings()]);

  const money = (amount: string) => formatMoney(amount, settings.currency);
  const address = order.deliveryAddress;
  const isCash = order.paymentMethod === "COD" && order.payment?.status !== "PAID" && order.status !== "CANCELLED";

  return (
    <div className="min-h-screen bg-muted/40 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between gap-2 px-4 print:hidden">
        <Button asChild variant="ghost">
          <Link href={`/orders/${order.id}`}>
            <ChevronLeft />
            Back to order
          </Link>
        </Button>
        <PrintOnLoad />
      </div>

      <main className="mx-auto flex max-w-2xl flex-col gap-5 bg-white p-8 text-[13px] leading-snug text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b border-black/20 pb-4">
          <div className="flex items-center gap-3">
            {settings.branding.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded or admin-entered URLs from any host
              <img src={settings.branding.logoUrl} alt="" className="size-12 object-contain" />
            )}
            <div>
              <p className="text-lg font-bold">{settings.appName}</p>
              <p className="text-black/70">
                {order.store.name}
                {order.store.phone && ` · ${order.store.phone}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold tracking-wider text-black/60 uppercase">Packing slip</p>
            <p className="text-base font-bold">{order.orderNumber}</p>
            <p className="text-black/70">{formatDateTime(order.createdAt, settings.timezone)}</p>
            {order.invoiceNumber && <p className="text-black/70">Bill {order.invoiceNumber}</p>}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wider text-black/60 uppercase">Deliver to</p>
            <p className="font-semibold">{address.name}</p>
            <p>{address.phone}</p>
            <p>
              {address.addressLine1}
              {address.addressLine2 && `, ${address.addressLine2}`}
            </p>
            {address.landmark && <p>Near {address.landmark}</p>}
            <p>
              {address.city}, {address.state} {address.postalCode}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold tracking-wider text-black/60 uppercase">Payment</p>
            {isCash ? (
              <p className="text-xl font-bold">Collect {money(order.payment?.amount ?? order.total)} cash</p>
            ) : (
              <p className="font-semibold">{order.paymentMethod === "COD" ? "Cash, collected" : "Paid online"}</p>
            )}
            {order.status === "CANCELLED" && <p className="font-bold">CANCELLED</p>}
          </div>
        </section>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-left text-xs tracking-wider text-black/60 uppercase">
              <th className="w-8 py-2" aria-label="Packed" />
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => {
              const supplied = item.quantity - item.unavailableQuantity;
              return (
                <tr key={item.id} className="break-inside-avoid border-b border-black/15 align-top">
                  <td className="py-2">
                    <span className="mt-0.5 block size-4 border-2 border-black" aria-hidden />
                  </td>
                  <td className="py-2 pr-2">
                    <p className={supplied === 0 ? "font-semibold line-through" : "font-semibold"}>{item.productName}</p>
                    <p className="text-black/70">{[item.variantName, item.sku].filter(Boolean).join(" · ")}</p>
                    {item.unavailableQuantity > 0 && (
                      <p className="font-semibold">
                        {supplied === 0 ? "Not supplied" : `${item.unavailableQuantity} not supplied`}
                      </p>
                    )}
                  </td>
                  <td className="py-2 text-right text-base font-bold tabular-nums">{supplied}</td>
                  <td className="py-2 text-right tabular-nums">{money(item.unitPrice)}</td>
                  <td className="py-2 text-right tabular-nums">{money(item.chargedTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <dl className="ml-auto grid w-64 grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
          <dt>Items</dt>
          <dd className="text-right">{money(order.subtotal)}</dd>
          <dt>Delivery fee</dt>
          <dd className="text-right">{Number(order.deliveryFee) === 0 ? "Free" : money(order.deliveryFee)}</dd>
          {Number(order.discount) > 0 && (
            <>
              <dt>{order.couponCode ? `Coupon ${order.couponCode}` : "Discount"}</dt>
              <dd className="text-right">−{money(order.discount)}</dd>
            </>
          )}
          <dt className="border-t border-black pt-1 text-base font-bold">Total</dt>
          <dd className="border-t border-black pt-1 text-right text-base font-bold">{money(order.total)}</dd>
          {Number(order.taxTotal) > 0 && (
            <>
              <dt className="text-black/70">Includes GST</dt>
              <dd className="text-right text-black/70">{money(order.taxTotal)}</dd>
            </>
          )}
        </dl>

        <footer className="border-t border-black/20 pt-3 text-center text-xs text-black/60">
          Packing slip, not a tax invoice · Packed by ____________
        </footer>
      </main>
    </div>
  );
}
