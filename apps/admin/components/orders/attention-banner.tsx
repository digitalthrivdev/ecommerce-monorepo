"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { pollAttention } from "@/app/(dashboard)/orders/actions";
import { Elapsed } from "@/components/orders/elapsed";
import { playChime, useSoundSetting } from "@/components/orders/new-order-alert";
import type { AttentionList, AttentionReason, OrderStatus } from "@/lib/types";

const POLL_MS = 30_000;
const SHOWN = 5;

const REASONS: Record<AttentionReason, { label: string; status: OrderStatus }> = {
  NOT_PACKED: { label: "Not packed yet", status: "CONFIRMED" },
  NOT_SHIPPED: { label: "Not picked up by the courier yet", status: "PACKED" },
};

const keyOf = (item: AttentionList["items"][number]) => `${item.orderId}:${item.reason}`;

/**
 * Orders left waiting too long, on every dashboard page for admins. Checked every 30
 * seconds; chimes (if order sounds are on) when a new order joins the list.
 */
export function AttentionBanner({ initial }: { initial: AttentionList }) {
  const sound = useSoundSetting();
  // A page refresh (e.g. after an order is packed) brings a newer list than the last poll.
  const [polled, setPolled] = useState<{ list: AttentionList; basis: AttentionList } | null>(null);
  const list = polled && polled.basis === initial ? polled.list : initial;
  const seen = useRef(new Set(initial.items.map(keyOf)));
  const state = useRef({ initial, soundOn: sound === "on" });
  useEffect(() => {
    state.current = { initial, soundOn: sound === "on" };
    for (const item of initial.items) seen.current.add(keyOf(item));
  });

  useEffect(() => {
    const id = setInterval(async () => {
      let next;
      try {
        next = await pollAttention();
      } catch {
        return; // Offline or the API is restarting; try again next time.
      }
      if (!next) return;
      const fresh = next.items.some((item) => !seen.current.has(keyOf(item)));
      seen.current = new Set(next.items.map(keyOf));
      if (fresh && state.current.soundOn) playChime();
      setPolled({ list: next, basis: state.current.initial });
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  if (list.items.length === 0) return null;

  const hidden = list.items.length - SHOWN;

  return (
    <div role="alert" className="border-b border-amber-600/30 bg-amber-50 px-4 py-3 dark:bg-amber-500/10">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="font-semibold">
            {list.items.length} {list.items.length === 1 ? "order needs" : "orders need"} attention
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {list.items.slice(0, SHOWN).map((item) => {
              const reason = REASONS[item.reason];
              return (
                <li key={keyOf(item)} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link href={`/orders/${item.orderId}`} className="font-medium underline underline-offset-2">
                    {item.orderNumber}
                  </Link>
                  <span className="text-foreground/80">
                    {reason.label}
                  </span>
                  <Elapsed since={item.since} status={reason.status} />
                </li>
              );
            })}
          </ul>
          {hidden > 0 && (
            <Link href="/orders" className="text-sm font-medium underline underline-offset-2">
              and {hidden} more
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
