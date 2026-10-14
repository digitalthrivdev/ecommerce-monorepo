"use client";

import { useEffect } from "react";
import { ImageOff } from "lucide-react";

import { MarkUnavailableDialog, NextStepButton } from "@/components/orders/order-actions";
import { Checkbox } from "@/components/ui/checkbox";
import { formatMoney } from "@/lib/format";
import { PACKING_STATUSES } from "@/lib/order-flow";
import { clearPackingTicks, usePackingTicks } from "@/lib/packing-ticks";
import type { OrderDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

type ChecklistProps = {
  order: Pick<OrderDetail, "id" | "orderNumber" | "status" | "items" | "allowedActions">;
  currency: string;
};

/** The order's items as a packing list: tick each one as it goes in the bag. */
export function PackingChecklist({ order, currency }: ChecklistProps) {
  const { ticked, toggle } = usePackingTicks(order.id);
  const packing = PACKING_STATUSES.includes(order.status);
  const canMarkUnavailable = order.allowedActions.includes("mark-unavailable");
  const packItemIds = order.items.filter((item) => item.quantity > item.unavailableQuantity).map((item) => item.id);
  const tickedCount = packItemIds.filter((id) => ticked.has(id)).length;

  useEffect(() => {
    if (!packing) clearPackingTicks(order.id);
  }, [packing, order.id]);

  return (
    <div className="flex flex-col gap-3">
      {packing && (
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${packItemIds.length ? (tickedCount / packItemIds.length) * 100 : 0}%` }}
            />
          </div>
          <span className="text-sm font-semibold tabular-nums">
            {tickedCount} of {packItemIds.length} packed
          </span>
        </div>
      )}

      <ul className="divide-y rounded-xl border bg-card shadow-xs">
        {order.items.map((item) => {
          const supplied = item.quantity - item.unavailableQuantity;
          const gone = supplied === 0;
          const isTicked = ticked.has(item.id);
          const checkboxId = `pack-${item.id}`;
          const Main = packing && !gone ? "label" : "div";
          return (
            <li
              key={item.id}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-2 p-3 transition-colors sm:flex-nowrap sm:p-4",
                packing && isTicked && "bg-green-50 dark:bg-green-500/10",
              )}
            >
              {packing && (
                <div className="flex w-8 shrink-0 justify-center">
                  {!gone && (
                    <Checkbox
                      id={checkboxId}
                      checked={isTicked}
                      onCheckedChange={() => toggle(item.id)}
                      className="size-7 rounded-md [&_svg]:size-5!"
                      aria-label={`Packed ${item.productName}`}
                    />
                  )}
                </div>
              )}
              <Main
                {...(Main === "label" ? { htmlFor: checkboxId } : {})}
                className={cn(
                  "flex min-w-0 items-center gap-3 sm:flex-1",
                  packing ? "w-[calc(100%-2.75rem)] sm:w-auto" : "w-full sm:w-auto",
                  Main === "label" && "cursor-pointer",
                )}
              >
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- uploaded or admin-entered URLs from any host
                    <img src={item.imageUrl} alt="" className={cn("size-full object-cover", gone && "opacity-40 grayscale")} />
                  ) : (
                    <ImageOff className="size-5 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("font-semibold", gone && "text-muted-foreground line-through")}>{item.productName}</p>
                  <p className="text-sm text-muted-foreground">
                    {[item.variantName, item.sku && `Code ${item.sku}`].filter(Boolean).join(" · ")}
                  </p>
                  {item.unavailableQuantity > 0 && (
                    <p className="text-sm font-medium text-destructive">
                      {gone ? "Not found, removed from the bill" : `${item.unavailableQuantity} not found, removed from the bill`}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("text-2xl font-bold tabular-nums", gone && "text-muted-foreground line-through")}>
                    × {gone ? item.quantity : supplied}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatMoney(item.chargedTotal, currency)}</p>
                </div>
              </Main>
              {canMarkUnavailable && !gone && (
                <MarkUnavailableDialog
                  orderId={order.id}
                  item={item}
                  className={cn("ml-11 sm:ml-0", !packing && "ml-0")}
                />
              )}
            </li>
          );
        })}
      </ul>

      {packing && (
        <NextStepButton
          orderId={order.id}
          orderNumber={order.orderNumber}
          status={order.status}
          allowedActions={order.allowedActions}
          carrier={null}
          packItemIds={packItemIds}
          className="w-full sm:ml-auto sm:w-auto sm:min-w-56"
        />
      )}
    </div>
  );
}
