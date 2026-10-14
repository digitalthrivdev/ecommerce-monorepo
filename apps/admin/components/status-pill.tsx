import {
  Ban,
  BellRing,
  CalendarClock,
  CircleCheck,
  Clock,
  FlaskConical,
  MapPin,
  PackageCheck,
  PackageX,
  Tag,
  TriangleAlert,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { ORDER_STATUS_LABELS, SHIPMENT_STATUS_LABELS } from "@/lib/format";
import type { OrderStatus, ShipmentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Tone = "blue" | "amber" | "violet" | "indigo" | "green" | "red" | "gray";

export const TONE_CLASSES: Record<Tone, string> = {
  blue: "bg-blue-50 text-blue-800 ring-blue-600/20 dark:bg-blue-500/15 dark:text-blue-200 dark:ring-blue-400/25",
  amber: "bg-amber-50 text-amber-900 ring-amber-600/25 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/25",
  violet: "bg-violet-50 text-violet-800 ring-violet-600/20 dark:bg-violet-500/15 dark:text-violet-200 dark:ring-violet-400/25",
  indigo: "bg-indigo-50 text-indigo-800 ring-indigo-600/20 dark:bg-indigo-500/15 dark:text-indigo-200 dark:ring-indigo-400/25",
  green: "bg-green-50 text-green-800 ring-green-600/20 dark:bg-green-500/15 dark:text-green-200 dark:ring-green-400/25",
  red: "bg-red-50 text-red-800 ring-red-600/20 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-400/25",
  gray: "bg-muted text-muted-foreground ring-foreground/10",
};

type PillProps = { tone: Tone; icon?: LucideIcon; size?: "sm" | "md"; className?: string; children: ReactNode };

/** A coloured label with an icon, so meaning never depends on colour alone. */
export function Pill({ tone, icon: Icon, size = "sm", className, children }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ring-1 ring-inset",
        size === "sm" ? "h-6 px-2.5 text-xs" : "h-8 px-3 text-sm",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {Icon && <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />}
      {children}
    </span>
  );
}

/** Orders placed through the review login by app store or payment gateway reviewers. */
export function ReviewAccountPill({ size }: { size?: "sm" | "md" }) {
  return (
    <Pill tone="violet" icon={FlaskConical} size={size}>
      Review account
    </Pill>
  );
}

export const ORDER_STATUS_STYLE: Record<OrderStatus, { tone: Tone; icon: LucideIcon }> = {
  PENDING_PAYMENT: { tone: "gray", icon: Clock },
  CONFIRMED: { tone: "blue", icon: BellRing },
  PACKED: { tone: "amber", icon: PackageCheck },
  SHIPPED: { tone: "violet", icon: Truck },
  IN_TRANSIT: { tone: "indigo", icon: Truck },
  OUT_FOR_DELIVERY: { tone: "indigo", icon: MapPin },
  DELIVERED: { tone: "green", icon: CircleCheck },
  CANCELLED: { tone: "red", icon: Ban },
  RTO: { tone: "red", icon: Undo2 },
};

export function OrderStatusPill({ status, size }: { status: OrderStatus; size?: "sm" | "md" }) {
  const { tone, icon } = ORDER_STATUS_STYLE[status];
  return (
    <Pill tone={tone} icon={icon} size={size}>
      {ORDER_STATUS_LABELS[status]}
    </Pill>
  );
}

const SHIPMENT_STATUS_STYLE: Record<ShipmentStatus, { tone: Tone; icon: LucideIcon }> = {
  PENDING: { tone: "gray", icon: Clock },
  AWB_ASSIGNED: { tone: "blue", icon: Tag },
  PICKUP_SCHEDULED: { tone: "blue", icon: CalendarClock },
  PICKED_UP: { tone: "violet", icon: PackageCheck },
  IN_TRANSIT: { tone: "indigo", icon: Truck },
  OUT_FOR_DELIVERY: { tone: "indigo", icon: MapPin },
  DELIVERED: { tone: "green", icon: CircleCheck },
  NDR: { tone: "amber", icon: TriangleAlert },
  RTO_IN_TRANSIT: { tone: "red", icon: Undo2 },
  RTO_DELIVERED: { tone: "red", icon: Undo2 },
  CANCELLED: { tone: "gray", icon: Ban },
  LOST: { tone: "red", icon: PackageX },
};

export function ShipmentStatusPill({ status, size }: { status: ShipmentStatus; size?: "sm" | "md" }) {
  const { tone, icon } = SHIPMENT_STATUS_STYLE[status];
  return (
    <Pill tone={tone} icon={icon} size={size}>
      {SHIPMENT_STATUS_LABELS[status]}
    </Pill>
  );
}
