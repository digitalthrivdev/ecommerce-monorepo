import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function currencySymbol(currency: string) {
  try {
    return (
      new Intl.NumberFormat("en-IN", { style: "currency", currency }).formatToParts(0).find((part) => part.type === "currency")?.value ??
      currency
    );
  } catch {
    return currency;
  }
}

/** An amount box with the currency sign inside on the left. */
export function MoneyInput({ currency, className, ...props }: { currency: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">{currencySymbol(currency)}</span>
      <Input inputMode="decimal" maxLength={11} autoComplete="off" className={cn("pl-8 tabular-nums", className)} {...props} />
    </div>
  );
}
