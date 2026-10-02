import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client";

type Tx = Prisma.TransactionClient;

/** GST contained in a price that includes it: amount × rate / (100 + rate), to the paisa. */
export function includedTax(amount: Prisma.Decimal, gstRate: Prisma.Decimal | null) {
  if (!gstRate || gstRate.lte(0)) return new Prisma.Decimal(0);
  return amount.mul(gstRate).div(gstRate.plus(100)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Indian financial year (April to March) of a date in the deployment's time zone, e.g. "2026-27". */
export function financialYear(date: Date, timeZone = env.TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric" }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")!.value);
  const month = Number(parts.find((part) => part.type === "month")!.value);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Gives the order the next invoice number of the current financial year, e.g. INV/2026-27/000123. */
export async function assignInvoiceNumber(tx: Tx, orderId: string) {
  const year = financialYear(new Date());
  const [row] = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "InvoiceSequence" ("financialYear", "lastNumber") VALUES (${year}, 1)
    ON CONFLICT ("financialYear") DO UPDATE SET "lastNumber" = "InvoiceSequence"."lastNumber" + 1
    RETURNING "lastNumber"
  `;
  const invoiceNumber = `INV/${year}/${String(row!.lastNumber).padStart(6, "0")}`;
  await tx.order.update({ where: { id: orderId }, data: { invoiceNumber } });
  return invoiceNumber;
}
