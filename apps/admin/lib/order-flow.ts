import type { OrderAction, OrderStatus } from "./types";

export type BoardColumn = { id: string; label: string; statuses: OrderStatus[]; empty: string };

export const BOARD_COLUMNS: BoardColumn[] = [
  { id: "new", label: "New", statuses: ["CONFIRMED"], empty: "No new orders" },
  { id: "packing", label: "Packing", statuses: ["STORE_ACCEPTED", "PICKING", "PACKED"], empty: "Nothing being packed" },
  { id: "ready", label: "Ready to send", statuses: ["READY_FOR_PICKUP"], empty: "Nothing waiting to go out" },
  { id: "way", label: "On the way", statuses: ["OUT_FOR_DELIVERY"], empty: "Nothing on the way" },
];

export const BOARD_STATUSES = BOARD_COLUMNS.flatMap((column) => column.statuses);

/** "pack-ready" packs and marks ready in one tap; the API still records both steps. */
export type NextStepAction = "accept" | "start-picking" | "pack-ready" | "ready" | "out-for-delivery" | "mark-delivered";

export const NEXT_STEP: Partial<Record<OrderStatus, { action: NextStepAction; label: string }>> = {
  CONFIRMED: { action: "accept", label: "Accept order" },
  STORE_ACCEPTED: { action: "start-picking", label: "Start packing" },
  PICKING: { action: "pack-ready", label: "Packed – ready" },
  PACKED: { action: "ready", label: "Ready to send" },
  // Admins only; the API leaves them out of staff's allowed actions.
  READY_FOR_PICKUP: { action: "out-for-delivery", label: "Out for delivery" },
  OUT_FOR_DELIVERY: { action: "mark-delivered", label: "Mark delivered" },
};

/** The step that can be taken now, if the API allows it for this user. */
export function nextStep(status: OrderStatus, allowedActions: OrderAction[]) {
  const step = NEXT_STEP[status];
  if (!step) return null;
  const needs = step.action === "pack-ready" ? "pack" : step.action;
  return allowedActions.includes(needs) ? step : null;
}

/** Minutes in a status before the timer turns amber, then red. */
const TIMER_LIMITS: Partial<Record<OrderStatus, [warn: number, late: number]>> = {
  CONFIRMED: [5, 10],
  STORE_ACCEPTED: [5, 10],
  PICKING: [10, 20],
  PACKED: [5, 10],
  READY_FOR_PICKUP: [10, 20],
  OUT_FOR_DELIVERY: [30, 45],
};

export function timerTone(status: OrderStatus, minutes: number): "normal" | "warn" | "late" {
  const limits = TIMER_LIMITS[status];
  if (!limits) return "normal";
  if (minutes >= limits[1]) return "late";
  if (minutes >= limits[0]) return "warn";
  return "normal";
}

/** Statuses where the packing checklist can be ticked. */
export const PACKING_STATUSES: OrderStatus[] = ["STORE_ACCEPTED", "PICKING"];

/** When the order reached its current status, from its history. */
export function statusChangedAt(order: {
  status: OrderStatus;
  createdAt: string;
  statusHistory: Array<{ fromStatus: OrderStatus | null; toStatus: OrderStatus; createdAt: string }>;
}) {
  const entry = order.statusHistory.findLast((item) => item.toStatus === order.status && item.fromStatus !== item.toStatus);
  return entry?.createdAt ?? order.createdAt;
}
