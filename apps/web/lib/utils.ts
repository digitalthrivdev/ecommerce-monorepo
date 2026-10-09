export { cn } from "cn";

/** "₹40" or "₹40.50" from an API amount such as "40.00". */
export function formatMoney(value: string, currency: string) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
}

export function formatDate(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone }).format(new Date(value));
}
