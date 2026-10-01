import { Prisma, type PrismaClient } from "../../generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Great-circle distance in km from the given point to the row's "latitude"/"longitude" columns. */
export function distanceKmSql(latitude: number, longitude: number) {
  return Prisma.sql`2 * 6371 * asin(least(1, sqrt(
    power(sin(radians(latitude::float8 - ${latitude}) / 2), 2) +
    cos(radians(${latitude})) * cos(radians(latitude::float8)) *
    power(sin(radians(longitude::float8 - ${longitude}) / 2), 2)
  )))`;
}

/** Whether an active store's service radius covers the point. */
export async function storeServesLocation(db: Db, storeId: string, latitude: number, longitude: number) {
  const [row] = await db.$queryRaw<{ serves: boolean }[]>`
    SELECT ${distanceKmSql(latitude, longitude)} <= "serviceRadiusKm"::float8 AS serves
    FROM "Store"
    WHERE id = ${storeId} AND status = 'ACTIVE'
  `;

  return row?.serves === true;
}
