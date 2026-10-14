import type { OrderAction, OrderStatus } from "./types";

export type BoardColumn = { id: string; label: string; statuses: OrderStatus[]; empty: string };

export const BOARD_COLUMNS: BoardColumn[] = [
  { id: "new", label: "To pack", statuses: ["CONFIRMED"], empty: "Nothing to pack" },
  { id: "packed", label: "To ship", statuses: ["PACKED"], empty: "Nothing waiting to ship" },
  { id: "shipped", label: "Shipped", statuses: ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY"], empty: "Nothing on the way" },
];

export const BOARD_STATUSES = BOARD_COLUMNS.flatMap((column) => column.statuses);

/** Shipping opens a dialog for the parcel; packing is one tap. */
export const NEXT_STEP: Partial<Record<OrderStatus, { action: Extract<OrderAction, "pack" | "ship">; label: string }>> = {
  CONFIRMED: { action: "pack", label: "Mark packed" },
  PACKED: { action: "ship", label: "Ship order" },
};

/** The step that can be taken now, if the API allows it for this user. */
export function nextStep(status: OrderStatus, allowedActions: OrderAction[]) {
  const step = NEXT_STEP[status];
  return step && allowedActions.includes(step.action) ? step : null;
}

/** Minutes in a status before the timer turns amber, then red; red matches the API's attention list. */
const TIMER_LIMITS: Partial<Record<OrderStatus, [warn: number, late: number]>> = {
  CONFIRMED: [6 * 60, 12 * 60],
  PACKED: [12 * 60, 24 * 60],
};

export function timerTone(status: OrderStatus, minutes: number): "normal" | "warn" | "late" {
  const limits = TIMER_LIMITS[status];
  if (!limits) return "normal";
  if (minutes >= limits[1]) return "late";
  if (minutes >= limits[0]) return "warn";
  return "normal";
}

/** Statuses where the packing checklist can be ticked. */
export const PACKING_STATUSES: OrderStatus[] = ["CONFIRMED"];

/** When the order reached its current status, from its history. */
export function statusChangedAt(order: {
  status: OrderStatus;
  createdAt: string;
  statusHistory: Array<{ fromStatus: OrderStatus | null; toStatus: OrderStatus; createdAt: string }>;
}) {
  const entry = order.statusHistory.findLast((item) => item.toStatus === order.status && item.fromStatus !== item.toStatus);
  return entry?.createdAt ?? order.createdAt;
}
