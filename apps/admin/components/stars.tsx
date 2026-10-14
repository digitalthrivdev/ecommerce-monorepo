import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/** A 1 to 5 star rating. */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span role="img" aria-label={`${value} out of 5 stars`} className={cn("inline-flex items-center gap-0.5", className)}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          aria-hidden
          className={cn("size-4", index < value ? (value <= 2 ? "fill-red-500 text-red-500" : "fill-amber-400 text-amber-400") : "text-muted-foreground/40")}
        />
      ))}
    </span>
  );
}
