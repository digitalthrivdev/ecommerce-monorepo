import { env } from "../config/env.js";
import { Prisma } from "../generated/prisma/client";

/** Midnight at the start of today in the client's time zone, as a SQL timestamptz expression. */
export const startOfTodaySql = () =>
  Prisma.sql`(date_trunc('day', now() AT TIME ZONE ${env.TIMEZONE}) AT TIME ZONE ${env.TIMEZONE})`;
