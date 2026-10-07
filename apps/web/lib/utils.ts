export { cn } from "cn";

export function formatDate(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone }).format(new Date(value));
}
