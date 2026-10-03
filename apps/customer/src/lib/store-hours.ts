import type { OpeningHours } from "./types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
};

/** Day of week and minutes past midnight in the store's time zone. */
function localTime(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (type: string) => parts.find((candidate) => candidate.type === type)!.value;
  return { day: WEEKDAYS.indexOf(part("weekday")), minutes: Number(part("hour")) * 60 + Number(part("minute")) };
}

/** "7 am", "9:30 pm" */
function formatClock(time: string) {
  const minutes = minutesOf(time);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour < 12 ? "am" : "pm";
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${suffix}`;
}

/** "Opens at 7 am", "Opens tomorrow at 7 am", "Opens Monday at 7 am"; null when it never opens. */
export function nextOpening(hours: OpeningHours[], timeZone: string, now = new Date()) {
  if (hours.length === 0) return null;
  const { day, minutes } = localTime(now, timeZone);

  for (let offset = 0; offset < 8; offset++) {
    const weekday = (day + offset) % 7;
    const entry = hours.find((candidate) => candidate.dayOfWeek === weekday);
    if (!entry || (offset === 0 && minutesOf(entry.opensAt) <= minutes)) continue;
    const when = offset === 0 ? "" : offset === 1 ? "tomorrow " : `${offset === 7 ? "next " : ""}${WEEKDAY_NAMES[weekday]} `;
    return `Opens ${when}at ${formatClock(entry.opensAt)}`;
  }
  return null;
}

/** "Fresh Mart is closed right now. Opens at 7 am." */
export function closedText(store: { name: string; hours: OpeningHours[] }, timeZone: string) {
  const opening = nextOpening(store.hours, timeZone);
  return `${store.name} is closed right now.${opening ? ` ${opening}.` : ""}`;
}
