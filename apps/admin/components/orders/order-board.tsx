"use client";

import Link from "next/link";
import { useState } from "react";
import { Clock } from "lucide-react";

import { Elapsed } from "@/components/orders/elapsed";
import { NextStepButton } from "@/components/orders/order-actions";
import { ReviewAccountPill } from "@/components/status-pill";
import { formatMoney, ORDER_STATUS_LABELS } from "@/lib/format";
import { BOARD_COLUMNS, nextStep, type BoardColumn } from "@/lib/order-flow";
import type { ActiveCarrier, OrderListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type BoardProps = {
  orders: OrderListItem[];
  currency: string;
  /** For the ship dialog; null when not known (staff). */
  carrier: ActiveCarrier | null;
};

function Ticket({ order, currency, carrier }: { order: OrderListItem } & Omit<BoardProps, "orders">) {
  const waiting = !nextStep(order.status, order.allowedActions);
  const shipment = order.shipment?.status === "CANCELLED" ? null : order.shipment;

  return (
    <article className="relative flex flex-col gap-2.5 rounded-xl border bg-card p-3.5 shadow-xs transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <Link
          href={`/orders/${order.id}`}
          className="shrink-0 font-bold underline-offset-4 after:absolute after:inset-0 after:rounded-xl hover:underline"
        >
          {order.orderNumber}
        </Link>
        <Elapsed since={order.statusChangedAt} status={order.status} />
      </div>

      <div className="flex flex-col gap-0.5 text-sm">
        <p className="truncate">
          <span className="font-medium">{order.customerName}</span>
          <span className="text-muted-foreground">
            {" "}
            · {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
          </span>
        </p>
        {order.paymentMethod === "COD" ? (
          <p className="font-semibold text-amber-800 dark:text-amber-300">Cash {formatMoney(order.total, currency)}</p>
        ) : (
          <p className="text-muted-foreground">Paid online · {formatMoney(order.total, currency)}</p>
        )}
        {order.reviewAccount && <ReviewAccountPill />}
      </div>

      {shipment?.awb && (
        <p className="truncate text-xs text-muted-foreground">
          {[shipment.courierName, `AWB ${shipment.awb}`].filter(Boolean).join(" · ")}
        </p>
      )}
      {waiting && order.status === "PACKED" && shipment && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-4" aria-hidden />
          Waiting for the courier to pick it up
        </p>
      )}
      {order.status !== "CONFIRMED" && order.status !== "PACKED" && (
        <p className="text-xs font-medium text-muted-foreground">{ORDER_STATUS_LABELS[order.status]}</p>
      )}

      {/* Above the ticket's link so the buttons stay clickable. */}
      <div className="relative z-10 empty:hidden">
        <NextStepButton
          orderId={order.id}
          orderNumber={order.orderNumber}
          status={order.status}
          allowedActions={order.allowedActions}
          carrier={carrier}
          size="lg"
          className="w-full"
        />
      </div>
    </article>
  );
}

function Column({ column, orders, hidden, ...rest }: { column: BoardColumn; orders: OrderListItem[]; hidden: boolean } & Omit<BoardProps, "orders">) {
  return (
    <section
      aria-labelledby={`column-${column.id}`}
      className={cn("flex min-w-0 flex-col gap-3 xl:rounded-2xl xl:bg-muted/50 xl:p-3", hidden && "hidden xl:flex")}
    >
      <h2 id={`column-${column.id}`} className="hidden items-center gap-2 px-1 text-sm font-semibold xl:flex">
        {column.label}
        <span className="rounded-full bg-background px-2 py-0.5 text-xs tabular-nums ring-1 ring-foreground/10">{orders.length}</span>
      </h2>
      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{column.empty}</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          {orders.map((order) => (
            <Ticket key={order.id} order={order} {...rest} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Orders in progress as three columns; below extra-wide screens the columns become tabs. */
export function OrderBoard({ orders, ...rest }: BoardProps) {
  const byColumn = new Map(
    BOARD_COLUMNS.map((column) => [column.id, orders.filter((order) => column.statuses.includes(order.status))]),
  );
  const [active, setActive] = useState(() => BOARD_COLUMNS.find((column) => byColumn.get(column.id)!.length > 0)?.id ?? "new");

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Order steps" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:-mx-6 md:px-6 xl:hidden">
        {BOARD_COLUMNS.map((column) => {
          const count = byColumn.get(column.id)!.length;
          const selected = column.id === active;
          return (
            <button
              key={column.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(column.id)}
              className={cn(
                "flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {column.label}
              <span
                className={cn(
                  "min-w-6 rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                  selected ? "bg-primary-foreground/20" : count > 0 && column.id === "new" ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-3">
        {BOARD_COLUMNS.map((column) => (
          <Column key={column.id} column={column} orders={byColumn.get(column.id)!} hidden={column.id !== active} {...rest} />
        ))}
      </div>
    </div>
  );
}
