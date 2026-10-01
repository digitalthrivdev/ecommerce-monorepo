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

/** "1 Oct, 4:32 pm" */
export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
