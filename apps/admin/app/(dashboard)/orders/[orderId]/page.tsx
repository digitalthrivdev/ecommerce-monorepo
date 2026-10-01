import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MapPin, Phone } from "lucide-react";

import { AutoRefresh } from "@/components/auto-refresh";
import { OrderActions } from "@/components/orders/order-actions";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { getCurrentUser, getPublicSettings } from "@/lib/dal";
import {
  DELIVERY_STATUS_LABELS,
  formatDateTime,
  formatMoney,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  ROLE_LABELS,
} from "@/lib/format";
import { getOrder } from "@/lib/orders";
import type { DeliveryPartner, Paginated } from "@/lib/types";

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
  const [order, settings] = await Promise.all([getOrder(user, orderId), getPublicSettings()]);

  const canAssign = order.allowedActions.includes("assign") || order.allowedActions.includes("reassign");
  const partners = canAssign
    ? await apiFetch<Paginated<DeliveryPartner>>("/delivery-partners", {
        query: { status: "ONLINE", isActive: true, limit: 100 },
      })
    : null;

  const money = (amount: string) => formatMoney(amount, settings.currency);
  const date = (value: string) => formatDateTime(value, settings.timezone);
  const address = order.deliveryAddress;
  const mapsUrl =
    address.latitude && address.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${address.latitude},${address.longitude}`
      : null;
  const isOpen = order.status !== "DELIVERED" && order.status !== "CANCELLED";

  return (
    <>
      {isOpen && <AutoRefresh seconds={30} />}
      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={`${order.store.name} · placed ${date(order.createdAt)}`}
        actions={
          <OrderActions
            storeId={order.store.id}
            orderId={order.id}
            orderNumber={order.orderNumber}
            allowedActions={order.allowedActions}
            partners={partners?.items ?? null}
          />
        }
      />

      <div className="flex flex-col gap-4 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/orders">
              <ArrowLeft />
              Orders
            </Link>
          </Button>
          <OrderStatusBadge status={order.status} />
          {order.paymentExpiresAt && (
            <span className="text-sm text-muted-foreground">Payment due by {date(order.paymentExpiresAt)}</span>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Items</CardTitle>
                <CardDescription>Prices as charged when the order was placed</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {order.items.map((item) => (
                      <TableRow key={item.productId}>
                        <TableCell className="whitespace-normal">{item.productName}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(item.unitPrice)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(item.totalPrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Separator className="my-4" />
                <dl className="ml-auto flex max-w-xs flex-col gap-1.5">
                  <Row label="Subtotal">{money(order.subtotal)}</Row>
                  <Row label="Delivery fee">{Number(order.deliveryFee) === 0 ? "Free" : money(order.deliveryFee)}</Row>
                  {Number(order.discount) > 0 && <Row label="Discount">−{money(order.discount)}</Row>}
                  <Row label="Total">
                    <span className="font-semibold">{money(order.total)}</span>
                  </Row>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>History</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="relative flex flex-col gap-4 border-l pl-5">
                  {order.statusHistory.map((entry, index) => (
                    <li key={index} className="relative">
                      <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-background bg-primary" />
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">{ORDER_STATUS_LABELS[entry.toStatus]}</span>
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
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Customer</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div>
                  <div className="font-medium">{address.name}</div>
                  <a href={`tel:${address.phone}`} className="inline-flex items-center gap-1 text-muted-foreground hover:underline">
                    <Phone className="size-3.5" />
                    {address.phone}
                  </a>
                </div>
                <address className="not-italic text-muted-foreground">
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
                  <Button asChild variant="outline" size="sm" className="w-fit">
                    <a href={mapsUrl} target="_blank" rel="noreferrer">
                      <MapPin />
                      Open in Maps
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Payment</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-2">
                  <Row label="Method">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</Row>
                  {order.payment && (
                    <>
                      <Row label="Status">
                        <Badge variant={order.payment.status === "PAID" ? "secondary" : order.payment.status === "FAILED" ? "destructive" : "outline"}>
                          {PAYMENT_STATUS_LABELS[order.payment.status]}
                        </Badge>
                      </Row>
                      <Row label="Amount">{money(order.payment.amount)}</Row>
                      {order.payment.paidAt && <Row label="Paid">{date(order.payment.paidAt)}</Row>}
                      {order.payment.refundedAt && <Row label="Refunded">{date(order.payment.refundedAt)}</Row>}
                    </>
                  )}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Delivery</CardTitle>
              </CardHeader>
              <CardContent>
                {order.delivery ? (
                  <dl className="flex flex-col gap-2">
                    <Row label="Status">{DELIVERY_STATUS_LABELS[order.delivery.status]}</Row>
                    {order.delivery.partner && (
                      <>
                        <Row label="Partner">{order.delivery.partner.name ?? "Unnamed partner"}</Row>
                        <Row label="Phone">
                          <a href={`tel:${order.delivery.partner.phone}`} className="hover:underline">
                            {order.delivery.partner.phone}
                          </a>
                        </Row>
                        {(order.delivery.partner.vehicleType || order.delivery.partner.vehicleNumber) && (
                          <Row label="Vehicle">
                            {[order.delivery.partner.vehicleType, order.delivery.partner.vehicleNumber].filter(Boolean).join(" · ")}
                          </Row>
                        )}
                      </>
                    )}
                    {order.delivery.assignedAt && <Row label="Assigned">{date(order.delivery.assignedAt)}</Row>}
                    {order.delivery.pickedUpAt && <Row label="Picked up">{date(order.delivery.pickedUpAt)}</Row>}
                    {order.delivery.deliveredAt && <Row label="Delivered">{date(order.delivery.deliveredAt)}</Row>}
                  </dl>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {order.status === "READY_FOR_PICKUP"
                      ? "Ready for pickup. Waiting for a delivery partner to be assigned."
                      : "A delivery partner is assigned once the order is ready for pickup."}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
