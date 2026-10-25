"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Send } from "lucide-react";

import { bulkShipOrders } from "@/app/(dashboard)/orders/actions";
import { NextStepButton } from "@/components/orders/order-actions";
import { OrderStatusPill, ReviewAccountPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toastResult } from "@/lib/action-toast";
import { formatDateTime, formatMoney } from "@/lib/format";
import { MANUAL_CARRIER, type ActiveCarrier, type OrderListItem } from "@/lib/types";

function payment(order: OrderListItem, currency: string) {
  return order.paymentMethod === "COD" ? `Cash ${formatMoney(order.total, currency)}` : `Paid online · ${formatMoney(order.total, currency)}`;
}

function shipmentLine(order: OrderListItem) {
  const shipment = order.shipment;
  if (!shipment?.awb || shipment.status === "CANCELLED") return null;
  return [shipment.courierName, `AWB ${shipment.awb}`].filter(Boolean).join(" · ");
}

export function OrdersTable({
  orders,
  currency,
  timezone,
  carrier,
}: {
  orders: OrderListItem[];
  currency: string;
  timezone: string;
  carrier: ActiveCarrier | null;
}) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const selected = orders.filter((order) => chosen.has(order.id)).map((order) => order.id);
  const all = selected.length > 0 && selected.length === orders.length;

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const clear = () => setChosen(new Set());

  const isManual = carrier?.name === MANUAL_CARRIER;
  const carrierLabel = carrier?.name === "shiprocket" ? "Shiprocket" : carrier?.label ?? "carrier";

  const onBulkPush = () => {
    if (!selected.length || isManual) return;
    startTransition(async () => {
      const result = await bulkShipOrders(selected);
      if (toastResult(result) && result.ok) {
        clear();
      }
    });
  };

  return (
    <>
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/60 px-4 py-2.5 text-sm">
          <span className="font-medium text-foreground">{selected.length} orders selected</span>
          <Button variant="ghost" size="sm" onClick={clear} disabled={pending}>
            Clear
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {!isManual && (
              <Button size="sm" disabled={pending} onClick={onBulkPush} className="gap-1.5">
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Push to {carrierLabel}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Mobile view */}
      <ul className="divide-y md:hidden">
        {orders.map((order) => {
          const isChecked = chosen.has(order.id);
          return (
            <li
              key={order.id}
              className={`relative flex items-start gap-3 p-4 transition-colors ${isChecked ? "bg-muted/40" : ""}`}
            >
              <div className="pt-0.5">
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => toggle(order.id)}
                  aria-label={`Select order ${order.orderNumber}`}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/orders/${order.id}`} className="font-semibold break-all hover:underline">
                    {order.orderNumber}
                  </Link>
                  <OrderStatusPill status={order.status} />
                </div>
                {order.reviewAccount && <ReviewAccountPill />}
                <p className="text-sm">
                  {order.customerName}
                  <span className="text-muted-foreground">
                    {" "}
                    · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {payment(order, currency)} · {formatDateTime(order.createdAt, timezone)}
                </p>
                {shipmentLine(order) && <p className="text-xs text-muted-foreground">{shipmentLine(order)}</p>}
                <div className="mt-2 self-end">
                  <NextStepButton
                    orderId={order.id}
                    orderNumber={order.orderNumber}
                    status={order.status}
                    allowedActions={order.allowedActions}
                    carrier={carrier}
                    size="default"
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop view */}
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 pl-4">
              <Checkbox
                checked={all ? true : selected.length > 0 ? "indeterminate" : false}
                onCheckedChange={() => setChosen(all ? new Set() : new Set(orders.map((order) => order.id)))}
                aria-label="Select all orders on this page"
              />
            </TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="pr-4 text-right">
              <span className="sr-only">Next step</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const isChecked = chosen.has(order.id);
            return (
              <TableRow key={order.id} data-state={isChecked ? "selected" : undefined}>
                <TableCell className="w-10 pl-4">
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggle(order.id)}
                    aria-label={`Select order ${order.orderNumber}`}
                  />
                </TableCell>
                <TableCell>
                  <Link href={`/orders/${order.id}`} className="font-semibold underline-offset-4 hover:underline">
                    {order.orderNumber}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(order.createdAt, timezone)} · {order.itemCount}{" "}
                    {order.itemCount === 1 ? "item" : "items"}
                  </div>
                </TableCell>
                <TableCell>
                  <div>{order.customerName}</div>
                  <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                  {order.reviewAccount && <ReviewAccountPill />}
                </TableCell>
                <TableCell>
                  <OrderStatusPill status={order.status} />
                  {shipmentLine(order) && <div className="mt-1 text-xs text-muted-foreground">{shipmentLine(order)}</div>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="tabular-nums">{formatMoney(order.total, currency)}</div>
                  <div className="text-xs text-muted-foreground">
                    {order.paymentMethod === "COD" ? "Cash" : "Online"}
                  </div>
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <NextStepButton
                    orderId={order.id}
                    orderNumber={order.orderNumber}
                    status={order.status}
                    allowedActions={order.allowedActions}
                    carrier={carrier}
                    size="default"
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
