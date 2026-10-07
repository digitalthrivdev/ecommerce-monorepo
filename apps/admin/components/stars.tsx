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

/** A rider's average delivery rating, e.g. "★ 4.6 (12)". */
export function RatingSummary({ rating }: { rating: { average: string | null; count: number } }) {
  if (!rating.average) return <span className="text-muted-foreground">No ratings</span>;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" title={`Average of ${rating.count} delivery ${rating.count === 1 ? "rating" : "ratings"}`}>
      <Star aria-hidden className="size-3.5 fill-amber-400 text-amber-400" />
      <span className="font-medium">{rating.average}</span>
      <span className="text-muted-foreground">({rating.count})</span>
    </span>
  );
}
