import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, FileText, MapPin, Phone } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { RefundDialog } from "@/components/complaints/refund-dialog";
import { Notice } from "@/components/notice";
import { Elapsed } from "@/components/orders/elapsed";
import { NextStepButton, OrderMoreMenu } from "@/components/orders/order-actions";
import { OrderProgress } from "@/components/orders/order-progress";
import { PackingChecklist } from "@/components/orders/packing-checklist";
import { ShipmentCard } from "@/components/orders/shipment-card";
import { PageHeader } from "@/components/page-header";
import { Block, PageBody, Panel, Section } from "@/components/section";
import { Stars } from "@/components/stars";
import { OrderStatusPill, ReviewAccountPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { getActiveCarrier, getCurrentUser, getPublicSettings } from "@/lib/dal";
import {
  COMPLAINT_REASON_LABELS,
  COMPLAINT_STATUS_LABELS,
  formatDateTime,
  formatMoney,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  REFUND_METHOD_LABELS,
  ROLE_LABELS,
} from "@/lib/format";
import { statusChangedAt } from "@/lib/order-flow";
import { getOrder } from "@/lib/orders";

export const metadata: Metadata = { title: "Order" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export default async function OrderPage({ params }: PageProps<"/orders/[orderId]">) {
  const { orderId } = await params;
  const user = await getCurrentUser();
  const [order, settings, carrier] = await Promise.all([getOrder(orderId), getPublicSettings(), getActiveCarrier()]);

  const money = (amount: string) => formatMoney(amount, settings.currency);
  const date = (value: string) => formatDateTime(value, settings.timezone);
  const address = order.deliveryAddress;
  const mapsUrl =
    address.latitude && address.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${address.latitude},${address.longitude}`
      : null;
  const isOpen = order.status !== "DELIVERED" && order.status !== "CANCELLED" && order.status !== "RTO";
  const packItemIds = order.items.filter((item) => item.quantity > item.unavailableQuantity).map((item) => item.id);
  const cancelEntry = order.status === "CANCELLED" ? order.statusHistory.findLast((entry) => entry.toStatus === "CANCELLED") : null;
  const collectCash = order.paymentMethod === "COD" && isOpen && order.payment?.status !== "PAID";

  return (
    <>
      {isOpen && <AutoRefresh seconds={30} />}
      <PageHeader
        back={{ href: "/orders", label: "Orders" }}
        title={order.orderNumber}
        status={
          <>
            <OrderStatusPill status={order.status} size="md" />
            {order.reviewAccount && <ReviewAccountPill size="md" />}
            {isOpen && order.status !== "PENDING_PAYMENT" && <Elapsed since={statusChangedAt(order)} status={order.status} className="h-8 px-3 text-sm" />}
          </>
        }
        description={[
          `Placed ${date(order.createdAt)}`,
          order.invoiceNumber && `Invoice ${order.invoiceNumber}`,
          order.paymentExpiresAt && `Payment due by ${date(order.paymentExpiresAt)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {order.invoiceNumber && (
              <Button asChild variant="outline">
                <a href={`/orders/${encodeURIComponent(order.id)}/invoice`} download>
                  <FileText />
                  Invoice
                </a>
              </Button>
            )}
            <OrderMoreMenu orderId={order.id} orderNumber={order.orderNumber} canCancel={order.allowedActions.includes("cancel")} />
            <NextStepButton
              orderId={order.id}
              orderNumber={order.orderNumber}
              status={order.status}
              allowedActions={order.allowedActions}
              carrier={carrier}
              packItemIds={packItemIds}
            />
          </>
        }
      />

      <PageBody className="max-w-6xl gap-6">
        {order.complaint && user.role === "ADMIN" && (
          <Notice
            tone={order.complaint.status === "OPEN" ? "warning" : "info"}
            title={
              <Link href={`/complaints/${order.complaint.id}`} className="underline-offset-4 hover:underline">
                {order.complaint.status === "OPEN" ? "Open complaint" : `Complaint ${COMPLAINT_STATUS_LABELS[order.complaint.status].toLowerCase()}`}:{" "}
                {COMPLAINT_REASON_LABELS[order.complaint.reason].toLowerCase()}
              </Link>
            }
          >
            Reported {date(order.complaint.createdAt)}
          </Notice>
        )}
        {order.status === "RTO" && (
          <Notice tone="danger" title="Not delivered">
            The courier couldn&apos;t deliver the parcel and is returning it to the pickup location (RTO).
          </Notice>
        )}
        {cancelEntry ? (
          <Notice tone="danger" title={`Cancelled ${date(cancelEntry.createdAt)}`}>
            {[
              cancelEntry.note,
              cancelEntry.changedBy && `by ${cancelEntry.changedBy.name ?? ROLE_LABELS[cancelEntry.changedBy.role]}`,
            ]
              .filter(Boolean)
              .join(" · ") || undefined}
          </Notice>
        ) : (
          order.status !== "PENDING_PAYMENT" && (
            <Panel className="px-2 py-4 sm:px-4">
              <OrderProgress order={order} timezone={settings.timezone} />
            </Panel>
          )
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <Section
              title={`Items (${order.items.length})`}
              hint={
                order.allowedActions.includes("mark-unavailable")
                  ? "Tick each item as you pack it. Can't find one? Tap Item not found."
                  : undefined
              }
            >
              <PackingChecklist order={order} currency={settings.currency} />
              <dl className="flex flex-col gap-1.5 self-end sm:min-w-64">
                <Row label="Items">{money(order.subtotal)}</Row>
                <Row label="Shipping">{Number(order.shippingFee) === 0 ? "Free" : money(order.shippingFee)}</Row>
                {Number(order.codFee) > 0 && <Row label="Cash on delivery">{money(order.codFee)}</Row>}
                {Number(order.discount) > 0 && <Row label={order.couponCode ? `Coupon ${order.couponCode}` : "Discount"}>−{money(order.discount)}</Row>}
                <Row label="Total">
                  <span className="text-base font-bold">{money(order.total)}</span>
                </Row>
                {Number(order.taxTotal) > 0 && (
                  <Row label="Includes GST">
                    <span className="text-muted-foreground">{money(order.taxTotal)}</span>
                  </Row>
                )}
              </dl>
            </Section>

            {order.shipment && (
              <ShipmentCard orderId={order.id} shipment={order.shipment} allowedActions={order.allowedActions} timezone={settings.timezone} />
            )}

            <details className="group rounded-xl border bg-card shadow-xs">
              <summary className="flex h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 font-semibold [&::-webkit-details-marker]:hidden">
                History ({order.statusHistory.length})
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <ol className="relative mx-4 mb-4 flex flex-col gap-4 border-l pl-5">
                {order.statusHistory.map((entry, index) => (
                  <li key={index} className="relative">
                    <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-background bg-primary" />
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {entry.fromStatus === entry.toStatus ? "Item not found" : ORDER_STATUS_LABELS[entry.toStatus]}
                      </span>
                      <span className="text-xs text-muted-foreground">{date(entry.createdAt)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {entry.changedBy
                        ? `${entry.changedBy.name ?? ROLE_LABELS[entry.changedBy.role]} (${ROLE_LABELS[entry.changedBy.role]})`
                        : "System"}
                      {entry.note && ` · ${entry.note}`}
                    </p>
                  </li>
                ))}
              </ol>
            </details>
          </div>

          <div className="flex flex-col gap-4">
            <Block title="Customer">
              <div className="flex flex-col gap-3 text-sm">
                <div>
                  <p className="text-base font-semibold">{address.name}</p>
                  <p className="text-muted-foreground tabular-nums">{address.phone}</p>
                </div>
                <Button asChild size="lg" variant="outline" className="w-full">
                  <a href={`tel:${address.phone}`}>
                    <Phone />
                    Call customer
                  </a>
                </Button>
                <address className="text-muted-foreground not-italic">
                  {address.addressLine1}
                  {address.addressLine2 && (
                    <>
                      <br />
                      {address.addressLine2}
                    </>
                  )}
                  {address.landmark && (
                    <>
                      <br />
                      Near {address.landmark}
                    </>
                  )}
                  <br />
                  {address.city}, {address.state} {address.postalCode}
                </address>
                {mapsUrl && (
                  <Button asChild variant="outline" className="w-full">
                    <a href={mapsUrl} target="_blank" rel="noreferrer">
                      <MapPin />
                      Open in Maps
                    </a>
                  </Button>
                )}
              </div>
            </Block>

            <Block title="Payment">
              {collectCash && (
                <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-600/25 ring-inset dark:bg-amber-500/10">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Collect in cash</p>
                  <p className="text-2xl font-bold tabular-nums">{money(order.payment?.amount ?? order.total)}</p>
                </div>
              )}
              <dl className="flex flex-col gap-2">
                <Row label="Method">{order.paymentMethod === "COD" ? "Cash on delivery" : "Online"}</Row>
                {order.payment && (
                  <>
                    <Row label="Status">{PAYMENT_STATUS_LABELS[order.payment.status]}</Row>
                    {!collectCash && <Row label="Amount">{money(order.payment.amount)}</Row>}
                    {order.payment.paidAt && <Row label="Paid">{date(order.payment.paidAt)}</Row>}
                    {Number(order.payment.refundedAmount) > 0 && <Row label="Refunded">{money(order.payment.refundedAmount)}</Row>}
                  </>
                )}
              </dl>
              {order.refunds.length > 0 && (
                <ul className="flex flex-col gap-2 border-t pt-3 text-sm">
                  {order.refunds.map((refund) => (
                    <li key={refund.id}>
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">
                          {money(refund.amount)} · {REFUND_METHOD_LABELS[refund.method]}
                        </span>
                        <span className="text-xs text-muted-foreground">{date(refund.createdAt)}</span>
                      </div>
                      <p className="text-muted-foreground">
                        {refund.reason}
                        {refund.reference && refund.method !== "GATEWAY" && ` · ${refund.reference}`}
                        {` · ${refund.createdBy ?? "Automatic"}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {order.allowedActions.includes("refund") && (
                <RefundDialog
                  target={{ orderId: order.id }}
                  paymentMethod={order.paymentMethod}
                  defaultAmount=""
                  refundable={order.refundable}
                  currency={settings.currency}
                  label="Refund part of the order"
                  variant="outline"
                />
              )}
            </Block>

            {!order.shipment && (
              <Block title="Shipping">
                <p className="text-sm text-muted-foreground">
                  {order.deliveredAt
                    ? `Delivered ${date(order.deliveredAt)}.`
                    : order.status === "PACKED"
                      ? "Packed. Ship it to book the courier."
                      : isOpen
                        ? "Ships once the order is packed."
                        : "Not shipped."}
                </p>
              </Block>
            )}

            {order.rating && (
              <Block title="Customer rating" hint={`Rated ${date(order.rating.createdAt)}`}>
                <dl className="flex flex-col gap-2">
                  <Row label="Delivery">
                    <Stars value={order.rating.deliveryRating} />
                  </Row>
                  <Row label="Items">
                    {order.rating.itemsRating ? <Stars value={order.rating.itemsRating} /> : <span className="text-muted-foreground">Not rated</span>}
                  </Row>
                </dl>
                {order.rating.comment && <p className="border-t pt-3 text-sm whitespace-pre-line">“{order.rating.comment}”</p>}
              </Block>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}
