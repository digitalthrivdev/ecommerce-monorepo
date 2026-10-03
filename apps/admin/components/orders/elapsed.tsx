"use client";

import { Timer } from "lucide-react";
import { useSyncExternalStore } from "react";

import { timerTone } from "@/lib/order-flow";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const TONE_CLASS = {
  normal: "text-muted-foreground",
  warn: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  late: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200",
} as const;

function minutesSince(since: string, now: number) {
  return Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
}

function label(minutes: number) {
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hr ${minutes % 60} min` : `${Math.floor(hours / 24)} d`;
}

const TICK_MS = 15_000;

function subscribeClock(onTick: () => void) {
  const id = setInterval(onTick, TICK_MS);
  return () => clearInterval(id);
}

/** Time spent in the current status; amber, then red, when it is taking too long. */
export function Elapsed({ since, status, className }: { since: string; status: OrderStatus; className?: string }) {
  // Rounded so the snapshot stays equal between reads; null while server rendering.
  const tick = useSyncExternalStore(subscribeClock, () => Math.floor(Date.now() / TICK_MS), () => null);
  const minutes = tick === null ? null : minutesSince(since, tick * TICK_MS);
  const tone = minutes === null ? "normal" : timerTone(status, minutes);

  return (
    <span
      title={tone === "late" ? "Taking too long" : tone === "warn" ? "Getting late" : undefined}
      className={cn(
        "inline-flex h-6 min-w-16 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      <Timer className="size-3.5" aria-hidden />
      {minutes !== null && label(minutes)}
    </span>
  );
}
