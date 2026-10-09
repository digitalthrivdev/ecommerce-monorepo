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

/** "1 Oct 2026" */
export function formatDate(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

/** "4:32 pm" */
export function formatTime(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** How far `amount` is below `target`, as a decimal string. Display only. */
export function shortfall(target: string, amount: string) {
  return (Math.max(0, Math.round(Number(target) * 100) - Math.round(Number(amount) * 100)) / 100).toFixed(2);
}

/** Whole-percent discount from MRP, or null when there is none. */
const BASE_UNITS: Record<string, { per: string; size: number }> = {
  g: { per: "kg", size: 1000 },
  gm: { per: "kg", size: 1000 },
  kg: { per: "kg", size: 1 },
  ml: { per: "L", size: 1000 },
  l: { per: "L", size: 1 },
  ltr: { per: "L", size: 1 },
  litre: { per: "L", size: 1 },
};

/** "₹43.80/kg" for packs measured by weight or volume, unless the pack is exactly 1 kg or 1 L. Display only. */
export function unitPrice(sellingPrice: string, quantity: string | null, unit: string | null, currency: string) {
  const base = unit ? BASE_UNITS[unit.trim().toLowerCase()] : undefined;
  const packs = Number(quantity) / (base?.size ?? 1);
  if (!base || !(packs > 0) || packs === 1) return null;
  return `${formatMoney((Number(sellingPrice) / packs).toFixed(2), currency)}/${base.per}`;
}

export function discountPercent(sellingPrice: string, mrp: string | null) {
  if (!mrp) return null;
  const [price, max] = [Math.round(Number(sellingPrice) * 100), Math.round(Number(mrp) * 100)];
  if (!(max > price)) return null;
  return Math.floor(((max - price) * 100) / max) || null;
}
