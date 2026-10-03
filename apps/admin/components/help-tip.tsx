"use client";

import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** A small (?) that explains a term. Opens on tap, so it works on tablets and phones too. */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`What is ${label}?`}
      >
        <CircleHelp className="size-4" />
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm leading-relaxed" side="top">
        {children}
      </PopoverContent>
    </Popover>
  );
}
