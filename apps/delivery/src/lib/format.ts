const LOCALE = "en-IN";

/** "₹58" for whole amounts, "₹58.50" otherwise. Display only; amounts come from the API. */
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

/** "3.6 km · 11 min away" */
export function formatPickup({ distanceKm, minutes }: { distanceKm: number; minutes: number }) {
  return `${distanceKm} km · ${minutes} min away`;
}

/** "18 min" or "1 h 5 min" between two times; null when either is missing. */
export function formatDuration(from: string | null, to: string | null) {
  if (!from || !to) return null;
  const minutes = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}

/** "October 2026" */
export function formatMonth(date: Date) {
  return new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" }).format(date);
}

/** "1 Oct, 4:32 pm" */
export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
