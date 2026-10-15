export { cn } from "cn";

/** "₹40" or "₹40.50" from an API amount such as "40.00". */
export function formatMoney(value: string, currency: string) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
}

export function formatDate(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone }).format(new Date(value));
}

export function formatDateTime(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

function cents(value: string) {
  const [whole = "0", fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

/** The cheapest variant a customer can buy, and whether other options cost more. */
export function cardOffer(variants: { price: string; compareAtPrice: string | null; inStock: boolean }[]) {
  const sellable = variants.filter((variant) => variant.inStock);
  const pool = sellable.length > 0 ? sellable : variants;
  const cheapest = pool.reduce((best, variant) => (cents(variant.price) < cents(best.price) ? variant : best));
  return {
    price: cheapest.price,
    compareAtPrice: cheapest.compareAtPrice && cents(cheapest.compareAtPrice) > cents(cheapest.price) ? cheapest.compareAtPrice : null,
    varies: pool.some((variant) => variant.price !== cheapest.price),
    inStock: sellable.length > 0,
  };
}

export function specificationsOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as { name?: unknown; value?: unknown };
    return typeof record.name === "string" && typeof record.value === "string" ? [{ name: record.name, value: record.value }] : [];
  });
}
