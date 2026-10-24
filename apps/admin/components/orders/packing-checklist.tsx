import { ImageOff } from "lucide-react";

import { formatMoney } from "@/lib/format";
import type { OrderDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

type ChecklistProps = {
  order: Pick<OrderDetail, "id" | "orderNumber" | "status" | "items" | "allowedActions">;
  currency: string;
};

/** Standard e-commerce items list showing products, variants, quantities, and pricing. */
export function PackingChecklist({ order, currency }: ChecklistProps) {
  return (
    <ul className="divide-y rounded-xl border bg-card shadow-xs">
      {order.items.map((item) => {
        const supplied = item.quantity - item.unavailableQuantity;
        const gone = supplied === 0;
        return (
          <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 sm:flex-nowrap sm:p-4">
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
                {[item.variantName, item.sku && `SKU: ${item.sku}`].filter(Boolean).join(" · ")}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatMoney(item.unitPrice, currency)} each
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-base font-bold tabular-nums">
                × {supplied || item.quantity}
              </p>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(item.chargedTotal, currency)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
