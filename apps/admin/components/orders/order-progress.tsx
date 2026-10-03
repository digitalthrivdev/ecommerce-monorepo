import { Check } from "lucide-react";

import { formatTime } from "@/lib/format";
import type { OrderDetail, OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STEPS: Array<{ label: string; statuses: OrderStatus[] }> = [
  { label: "Placed", statuses: ["CONFIRMED"] },
  { label: "Accepted", statuses: ["STORE_ACCEPTED"] },
  { label: "Packing", statuses: ["PICKING"] },
  { label: "Ready", statuses: ["PACKED", "READY_FOR_PICKUP", "ASSIGNED"] },
  { label: "Picked up", statuses: ["PICKED_UP", "OUT_FOR_DELIVERY"] },
  { label: "Delivered", statuses: ["DELIVERED"] },
];

const stepOf = (status: OrderStatus) => STEPS.findIndex((step) => step.statuses.includes(status));

/** Placed → Accepted → Packing → Ready → Picked up → Delivered, with the time each step was reached. */
export function OrderProgress({ order, timezone }: { order: OrderDetail; timezone: string }) {
  const steps = order.statusHistory.filter((entry) => entry.fromStatus !== entry.toStatus);
  // A cancelled order shows how far it got.
  const reached =
    order.status === "CANCELLED" ? Math.max(-1, ...steps.map((entry) => stepOf(entry.toStatus))) : stepOf(order.status);
  const cancelled = order.status === "CANCELLED";
  const done = order.status === "DELIVERED";

  return (
    <ol aria-label="Order progress" className="grid grid-cols-6">
      {STEPS.map((step, index) => {
        const at = steps.find((entry) => step.statuses.includes(entry.toStatus))?.createdAt ?? (index === 0 && reached >= 0 ? order.createdAt : null);
        const isDone = index < reached || (done && index === reached);
        const isCurrent = index === reached && !done && !cancelled;
        return (
          <li key={step.label} aria-current={isCurrent ? "step" : undefined} className="relative flex flex-col items-center gap-1.5 text-center">
            {index > 0 && (
              <span
                aria-hidden
                className={cn("absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2", index <= reached ? "bg-primary" : "bg-border")}
              />
            )}
            <span
              className={cn(
                "relative flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold",
                isDone && "border-primary bg-primary text-primary-foreground",
                isCurrent && "border-primary bg-background text-primary-ink ring-4 ring-primary/20",
                !isDone && !isCurrent && "border-border bg-background text-muted-foreground",
              )}
            >
              {isDone ? <Check className="size-4" aria-hidden /> : index + 1}
            </span>
            <span className={cn("px-0.5 text-[11px] leading-tight font-semibold sm:text-sm", !isDone && !isCurrent && "text-muted-foreground")}>
              {step.label}
            </span>
            {at && index <= reached && (
              <span className="text-[10px] leading-none text-muted-foreground tabular-nums sm:text-xs">{formatTime(at, timezone)}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
