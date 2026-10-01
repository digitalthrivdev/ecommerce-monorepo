import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

const VARIANTS: Partial<Record<OrderStatus, "default" | "secondary" | "destructive" | "outline">> = {
  CONFIRMED: "default",
  READY_FOR_PICKUP: "default",
  DELIVERED: "secondary",
  CANCELLED: "destructive",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={VARIANTS[status] ?? "outline"}>{ORDER_STATUS_LABELS[status]}</Badge>;
}
