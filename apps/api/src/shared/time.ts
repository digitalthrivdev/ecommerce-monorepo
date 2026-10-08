import { env } from "../config/env.js";
import { Prisma } from "../generated/prisma/client";

/** Midnight at the start of today in the client's time zone, as a SQL timestamptz expression. */
export const startOfTodaySql = () =>
  Prisma.sql`(date_trunc('day', now() AT TIME ZONE ${env.TIMEZONE}) AT TIME ZONE ${env.TIMEZONE})`;

/** How far the time zone's wall clock is ahead of UTC at the given moment, in milliseconds. */
function zoneOffsetMs(date: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(date)
      .map((part) => [part.type, Number(part.value)]),
  );
  const wallClock = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  return wallClock - Math.floor(date.getTime() / 1000) * 1000;
}

/** Midnight at the start of a calendar day (`YYYY-MM-DD`) in the client's time zone. */
export function startOfDay(day: string, timeZone = env.TIMEZONE) {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  const guess = new Date(utcMidnight.getTime() - zoneOffsetMs(utcMidnight, timeZone));
  return new Date(utcMidnight.getTime() - zoneOffsetMs(guess, timeZone));
}

/** The calendar day (`YYYY-MM-DD`) of a moment in the client's time zone. */
export function dayOf(date: Date, timeZone = env.TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

/** Midnight at the end of a calendar day (`YYYY-MM-DD`) in the client's time zone. */
export function endOfDay(day: string, timeZone = env.TIMEZONE) {
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return startOfDay(next.toISOString().slice(0, 10), timeZone);
}
