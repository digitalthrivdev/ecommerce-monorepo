import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client";
import { invoiceGstin, isSameState } from "../../shared/gst.js";
import { getAppearance } from "../settings/appearance.service.js";
import { getPlatformSettings } from "../settings/settings.service.js";
import { defaultPickupLocation } from "../shipping/pickup-locations.service.js";

type Tx = Prisma.TransactionClient;

/** GST contained in a price that includes it: amount × rate / (100 + rate), to the paisa. */
export function includedTax(amount: Prisma.Decimal, gstRate: Prisma.Decimal | null) {
  if (!gstRate || gstRate.lte(0)) return new Prisma.Decimal(0);
  return amount.mul(gstRate).div(gstRate.plus(100)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Splits an order discount across its lines in proportion to their amounts, to the paisa. The
 * rounding difference goes to the largest line, so the shares always add up to the discount.
 */
export function discountShares(amounts: Prisma.Decimal[], discount: Prisma.Decimal) {
  const total = amounts.reduce((sum, amount) => sum.plus(amount), new Prisma.Decimal(0));
  if (discount.lte(0) || total.lte(0)) return amounts.map(() => new Prisma.Decimal(0));

  const shares = amounts.map((amount) => discount.mul(amount).div(total).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN));
  const largest = amounts.reduce((best, amount, index) => (amount.gt(amounts[best]!) ? index : best), 0);
  const allocated = shares.reduce((sum, share) => sum.plus(share), new Prisma.Decimal(0));
  shares[largest] = shares[largest]!.plus(discount.minus(allocated));
  return shares;
}

/** Indian financial year (April to March) of a date in the deployment's time zone, e.g. "2026-27". */
export function financialYear(date: Date, timeZone = env.TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric" }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")!.value);
  const month = Number(parts.find((part) => part.type === "month")!.value);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/**
 * Gives the order the next invoice number of the current financial year, e.g. INV/2026-27/000123,
 * and copies the seller onto it: legal name, GSTIN (see invoiceGstin), the default pickup
 * location's address, and whether the supply is inter-state. Invoices only ever read this snapshot.
 */
export async function assignInvoiceNumber(tx: Tx, orderId: string) {
  const year = financialYear(new Date());
  const [row] = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO "InvoiceSequence" ("financialYear", "lastNumber") VALUES (${year}, 1)
    ON CONFLICT ("financialYear") DO UPDATE SET "lastNumber" = "InvoiceSequence"."lastNumber" + 1
    RETURNING "lastNumber"
  `;
  const invoiceNumber = `INV/${year}/${String(row!.lastNumber).padStart(6, "0")}`;

  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { state: true } });
  const settings = await getPlatformSettings(tx);
  const origin = await defaultPickupLocation(tx);
  await tx.order.update({
    where: { id: orderId },
    data: {
      invoiceNumber,
      sellerName: settings.businessName ?? (await getAppearance(tx)).appearance.appName,
      ...(origin && {
        sellerGstin: invoiceGstin(origin.state, settings.gstin),
        sellerAddress: [origin.addressLine1, origin.addressLine2, origin.city, `${origin.state} ${origin.postalCode}`].filter(Boolean).join(", "),
        interStateSupply: !isSameState(origin.state, order.state),
      }),
    },
  });
  return invoiceNumber;
}
