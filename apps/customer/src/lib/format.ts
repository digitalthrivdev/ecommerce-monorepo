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

/** "4,533", or "1.9 lac" from a lakh up. */
export function formatCount(count: number) {
  if (count >= 100_000) return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(count / 100_000)} lac`;
  return new Intl.NumberFormat(LOCALE).format(count);
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
export function unitPrice(price: string, quantity: string | null, unit: string | null, currency: string) {
  const base = unit ? BASE_UNITS[unit.trim().toLowerCase()] : undefined;
  const packs = Number(quantity) / (base?.size ?? 1);
  if (!base || !(packs > 0) || packs === 1) return null;
  return `${formatMoney((Number(price) / packs).toFixed(2), currency)}/${base.per}`;
}

/** Whole-percent discount from the compare-at price, or null when there is none. */
export function discountPercent(price: string, compareAtPrice: string | null) {
  if (!compareAtPrice) return null;
  const [paise, max] = [Math.round(Number(price) * 100), Math.round(Number(compareAtPrice) * 100)];
  if (!(max > paise)) return null;
  return Math.floor(((max - paise) * 100) / max) || null;
}
