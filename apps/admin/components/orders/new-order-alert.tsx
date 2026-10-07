"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BellOff, BellRing, X } from "lucide-react";
import { toast } from "sonner";

import { getNewOrders } from "@/app/(dashboard)/orders/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const POLL_MS = 15_000;
const SOUND_KEY = "order-sounds";
const SOUND_EVENT = "order-sounds-change";
const TITLE_PREFIX = /^\(\d+\) New orders? · /;

type SoundSetting = "on" | "off" | "unset" | "server";

function subscribeSound(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SOUND_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SOUND_EVENT, onChange);
  };
}

export function useSoundSetting(): SoundSetting {
  return useSyncExternalStore(
    subscribeSound,
    () => (localStorage.getItem(SOUND_KEY) as "on" | "off" | null) ?? "unset",
    () => "server",
  );
}

function setSound(value: "on" | "off") {
  localStorage.setItem(SOUND_KEY, value);
  window.dispatchEvent(new Event(SOUND_EVENT));
}

let audio: AudioContext | null = null;

/** Browsers only start audio after a click, so this runs from one. */
function unlockAudio() {
  audio ??= new AudioContext();
  if (audio.state === "suspended") void audio.resume();
}

/** A short two-note chime made in the browser, played twice. */
export function playChime() {
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();
  const start = audio.currentTime + 0.05;
  const notes: Array<[frequency: number, offset: number]> = [
    [880, 0],
    [1318.5, 0.16],
    [880, 0.6],
    [1318.5, 0.76],
  ];
  for (const [frequency, offset] of notes) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.5, start + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.4);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.45);
  }
}

function useTabTitle(count: number) {
  useEffect(() => {
    const apply = () => {
      const base = document.title.replace(TITLE_PREFIX, "");
      const next = count > 0 ? `(${count}) New order${count === 1 ? "" : "s"} · ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    // Page titles change on navigation; put the prefix back each time.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = document.title.replace(TITLE_PREFIX, "");
    };
  }, [count]);
}

/**
 * Checks for new orders every 15 seconds. When one arrives it chimes (if sounds are on), shows
 * the count in the tab title and a toast, and refreshes the page data.
 */
export function NewOrderAlert({ initialCount, staff }: { initialCount: number; staff: boolean }) {
  const router = useRouter();
  const sound = useSoundSetting();
  // The layout's count wins once a refresh brings a newer one.
  const [polled, setPolled] = useState<{ count: number; basis: number } | null>(null);
  const count = polled && polled.basis === initialCount ? polled.count : initialCount;

  const state = useRef({ count, initialCount, sound });
  useEffect(() => {
    state.current = { count, initialCount, sound };
  });

  useTabTitle(count);

  useEffect(() => {
    if (sound !== "on") return;
    document.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => document.removeEventListener("pointerdown", unlockAudio);
  }, [sound]);

  useEffect(() => {
    let stopped = false;
    const id = setInterval(async () => {
      let snapshot;
      try {
        snapshot = await getNewOrders();
      } catch {
        return; // Offline or the API is restarting; try again next time.
      }
      const current = state.current;
      if (stopped || snapshot.count === current.count) return;

      setPolled({ count: snapshot.count, basis: current.initialCount });
      if (snapshot.count > current.count && snapshot.latest) {
        const latest = snapshot.latest;
        if (current.sound === "on") playChime();
        toast(`New order ${latest.orderNumber}`, {
          id: "new-order",
          description: `${latest.customerName} · ${latest.itemCount} ${latest.itemCount === 1 ? "item" : "items"}`,
          icon: <BellRing className="size-4 text-primary-ink" />,
          duration: 30_000,
          action: { label: "Open", onClick: () => router.push(`/orders/${latest.id}`) },
        });
      }
      // Updates the order screens and the sidebar count; unsaved form edits are kept.
      router.refresh();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [router]);

  if (sound !== "unset") return null;

  return (
    <div
      className={cn(
        "fixed right-4 z-40 flex items-center gap-1 rounded-xl border bg-card p-1.5 shadow-lg",
        staff ? "bottom-24 md:bottom-4" : "bottom-4",
      )}
    >
      <Button
        onClick={() => {
          unlockAudio();
          playChime();
          setSound("on");
          toast.success("Order sounds are on", { description: "You'll hear this chime when a new order comes in." });
        }}
      >
        <BellRing />
        Turn on order sounds
      </Button>
      <Button variant="ghost" size="icon" aria-label="No order sounds" onClick={() => setSound("off")}>
        <X />
      </Button>
    </div>
  );
}

/** Switches order sounds on or off on this device. */
export function OrderSoundToggle() {
  const sound = useSoundSetting();
  if (sound === "server") return null;
  const on = sound === "on";

  return (
    <Button
      variant="outline"
      aria-pressed={on}
      onClick={() => {
        if (on) {
          setSound("off");
        } else {
          unlockAudio();
          playChime();
          setSound("on");
        }
      }}
    >
      {on ? <BellRing /> : <BellOff />}
      {on ? "Sound on" : "Sound off"}
    </Button>
  );
}
