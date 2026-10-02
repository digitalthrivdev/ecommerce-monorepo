import { env } from "../../config/env.js";

export type OpeningHours = { dayOfWeek: number; opensAt: string; closesAt: string };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours! * 60 + minutes!;
};

function localTime(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) => parts.find((candidate) => candidate.type === type)!.value;
  return { day: WEEKDAYS.indexOf(part("weekday")), minutes: Number(part("hour")) * 60 + Number(part("minute")) };
}

/**
 * Whether a store is open at `now` in the deployment's time zone. No hours at all means always
 * open; otherwise a day without hours is closed. Hours that close earlier than they open run past
 * midnight into the next day.
 */
export function isStoreOpen(hours: OpeningHours[], now = new Date(), timeZone = env.TIMEZONE) {
  if (hours.length === 0) return true;

  const { day, minutes } = localTime(now, timeZone);

  const today = hours.find((entry) => entry.dayOfWeek === day);
  if (today) {
    const opens = minutesOf(today.opensAt);
    const closes = minutesOf(today.closesAt);
    if (opens < closes ? minutes >= opens && minutes < closes : minutes >= opens) return true;
  }

  const yesterday = hours.find((entry) => entry.dayOfWeek === (day + 6) % 7);
  if (yesterday) {
    const opens = minutesOf(yesterday.opensAt);
    const closes = minutesOf(yesterday.closesAt);
    if (closes < opens && minutes < closes) return true;
  }

  return false;
}

export const hoursSelect = { dayOfWeek: true, opensAt: true, closesAt: true } as const;
export const hoursOrder = { dayOfWeek: "asc" } as const;
