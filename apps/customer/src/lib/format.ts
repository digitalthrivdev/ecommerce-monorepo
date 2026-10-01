const LOCALE = "en-IN";

/** "₹58" for whole amounts, "₹58.50" otherwise. Display only; totals come from the API. */
export function formatMoney(amount: string, currency: string) {
  const value = Number(amount);
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** "1 Oct, 4:32 pm" */
export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** "4:32 pm" */
export function formatTime(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** "500 g", "1 L"; null when the product has no pack size. */
export function formatPackSize(quantity: string | null, unit: string | null) {
  return [quantity && Number(quantity).toString(), unit].filter(Boolean).join(" ") || null;
}

/** How far `amount` is below `target`, as a decimal string. Display only. */
export function shortfall(target: string, amount: string) {
  return (Math.max(0, Math.round(Number(target) * 100) - Math.round(Number(amount) * 100)) / 100).toFixed(2);
}

/** Whole-percent discount from MRP, or null when there is none. */
export function discountPercent(sellingPrice: string, mrp: string | null) {
  if (!mrp) return null;
  const [price, max] = [Math.round(Number(sellingPrice) * 100), Math.round(Number(mrp) * 100)];
  if (!(max > price)) return null;
  return Math.floor(((max - price) * 100) / max) || null;
}
