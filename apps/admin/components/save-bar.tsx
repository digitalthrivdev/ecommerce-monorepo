"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SaveBarProps = {
  visible: boolean;
  pending: boolean;
  onSave: () => void;
  onDiscard?: () => void;
  message?: string;
  saveLabel?: string;
};

/**
 * The "Unsaved changes" bar over the top of the page. It takes no space, so nothing jumps when it
 * appears, and leaving the page with unsaved changes asks first.
 */
export function SaveBar({ visible, pending, onSave, onDiscard, message = "Unsaved changes", saveLabel = "Save" }: SaveBarProps) {
  useEffect(() => {
    if (!visible) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [visible]);

  return (
    <div className="sticky top-0 z-40 h-0">
      <div
        role="region"
        aria-label="Unsaved changes"
        aria-hidden={!visible}
        className={cn(
          "absolute inset-x-0 top-0 flex min-h-14 items-center gap-3 bg-zinc-900 px-4 py-2 text-white shadow-lg transition-all duration-200 md:px-6 dark:bg-zinc-800",
          visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0",
        )}
      >
        <span className="size-2 shrink-0 rounded-full bg-amber-400" aria-hidden />
        <p className="flex-1 truncate text-sm font-semibold">{message}</p>
        {onDiscard && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onDiscard}
            tabIndex={visible ? 0 : -1}
            className="text-white hover:bg-white/10 hover:text-white"
          >
            Discard
          </Button>
        )}
        <Button
          type="button"
          disabled={pending}
          onClick={onSave}
          tabIndex={visible ? 0 : -1}
          className="bg-white text-zinc-900 shadow-none hover:bg-white/90"
        >
          {pending && <Loader2 className="animate-spin" />}
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
