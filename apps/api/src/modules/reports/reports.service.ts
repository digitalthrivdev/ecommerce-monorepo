import { env } from "../../config/env.js";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { endOfDay, startOfDay } from "../../shared/time.js";
import { DELIVERY_SAC } from "../invoices/invoice.js";
import type { ReportQuery } from "./reports.schemas.js";

type Cell = string | number | Prisma.Decimal | null;

/** One CSV line. Text that a spreadsheet would run as a formula is prefixed with a quote. */
export function csvLine(cells: Cell[]) {
  return (
    cells
      .map((cell) => {
        if (cell === null) return "";
        if (typeof cell === "number") return String(cell);
        if (Prisma.Decimal.isDecimal(cell)) return cell.toFixed(2);
        const text = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(",") + "\r\n"
  );
}

const zero = () => new Prisma.Decimal(0);
const PAYMENTS_BATCH = 500;

/** A timestamp column as a calendar day in the deployment's time zone (columns hold UTC). */
const localDay = (column: Prisma.Sql) => Prisma.sql`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${env.TIMEZONE}, 'YYYY-MM-DD')`;

function daysBetween(from: string, to: string) {
  const days: string[] = [];
  for (let day = new Date(`${from}T00:00:00Z`); day.toISOString().slice(0, 10) <= to; day.setUTCDate(day.getUTCDate() + 1)) {
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

type DailyRow = {
  day: string;
  orders: number;
  items: Prisma.Decimal;
  discount: Prisma.Decimal;
  deliveryFee: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
  cod: Prisma.Decimal;
  online: Prisma.Decimal;
};

type GstRow = {
  kind: "goods" | "delivery";
  hsn: string | null;
  rate: Prisma.Decimal | null;
  quantity: number | null;
  value: Prisma.Decimal;
  tax: Prisma.Decimal;
  cgst: Prisma.Decimal;
  sgst: Prisma.Decimal;
  igst: Prisma.Decimal;
  unsplit: Prisma.Decimal;
};

type MoneyRow = {
  at: Date;
  id: string;
  type: "PAYMENT" | "REFUND";
  orderNumber: string;
  invoiceNumber: string | null;
  method: string;
  provider: string | null;
  reference: string | null;
  amount: Prisma.Decimal;
  reason: string | null;
};

/**
 * CSV exports for the accountant. Sales and GST count delivered orders by their delivery (invoice)
 * date; payments and refunds by when the money moved. Days are in the deployment's TIMEZONE.
 */
export function createReportsService(prisma: PrismaClient) {
  function scope({ from, to }: ReportQuery) {
    return { start: startOfDay(from), end: endOfDay(to) };
  }

  /** One line per day, including days without sales, then a total. */
  async function dailySales(query: ReportQuery) {
    const { start, end } = scope(query);
    const rows = await prisma.$queryRaw<DailyRow[]>`
      SELECT ${localDay(Prisma.sql`h."createdAt"`)} AS day,
        count(*)::int AS orders,
        sum(o.subtotal) AS items,
        sum(o.discount) AS discount,
        sum(o."deliveryFee") AS "deliveryFee",
        sum(o."taxTotal") AS tax,
        sum(o.total) AS total,
        coalesce(sum(o.total) FILTER (WHERE o."paymentMethod" = 'COD'), 0) AS cod,
        coalesce(sum(o.total) FILTER (WHERE o."paymentMethod" = 'ONLINE'), 0) AS online
      FROM "Order" o
      JOIN "OrderStatusHistory" h ON h."orderId" = o.id AND h."toStatus" = 'DELIVERED'
      WHERE o.status = 'DELIVERED' AND h."createdAt" >= ${start} AND h."createdAt" < ${end}
      GROUP BY 1
    `;
    const byDay = new Map(rows.map((row) => [row.day, row]));
    const empty = { orders: 0, items: zero(), discount: zero(), deliveryFee: zero(), tax: zero(), total: zero(), cod: zero(), online: zero() };
    const totals = { ...empty };
    let csv = csvLine([
      "date",
      "orders",
      "item_sales",
      "coupon_discounts",
      "delivery_fees",
      "invoice_total",
      "taxable_value",
      "gst",
      "cash_on_delivery",
      "paid_online",
    ]);
    const line = (label: string, row: typeof empty) =>
      csvLine([label, row.orders, row.items, row.discount, row.deliveryFee, row.total, row.total.minus(row.tax), row.tax, row.cod, row.online]);

    for (const day of daysBetween(query.from, query.to)) {
      const row = byDay.get(day) ?? empty;
      csv += line(day, row);
      totals.orders += row.orders;
      for (const key of ["items", "discount", "deliveryFee", "tax", "total", "cod", "online"] as const) {
        totals[key] = totals[key].plus(row[key]);
      }
    }
    return csv + line("Total", totals);
  }

  /**
   * Taxable value and GST by HSN and rate, with the delivery fee under its SAC. The split follows
   * each order's snapshot: CGST + SGST within the state, IGST across states. Orders delivered before
   * the snapshot have their GST under gst_not_split.
   */
  async function gstSummary(query: ReportQuery) {
    const { start, end } = scope(query);
    const delivered = Prisma.sql`o.status = 'DELIVERED' AND h."createdAt" >= ${start} AND h."createdAt" < ${end}`;
    const rows = await prisma.$queryRaw<GstRow[]>`
      WITH lines AS (
        SELECT 'goods' AS kind, i."hsnCode" AS hsn, i."gstRate" AS rate, o."interStateSupply" AS inter,
          i.quantity - i."unavailableQuantity" AS quantity,
          i."unitPrice" * (i.quantity - i."unavailableQuantity") - i.discount AS value,
          i."taxAmount" AS tax
        FROM "OrderItem" i
        JOIN "Order" o ON o.id = i."orderId"
        JOIN "OrderStatusHistory" h ON h."orderId" = o.id AND h."toStatus" = 'DELIVERED'
        WHERE ${delivered} AND i.quantity > i."unavailableQuantity"
        UNION ALL
        SELECT 'delivery', ${DELIVERY_SAC}, o."deliveryFeeGstRate", o."interStateSupply", NULL, o."deliveryFee", o."deliveryFeeTax"
        FROM "Order" o
        JOIN "OrderStatusHistory" h ON h."orderId" = o.id AND h."toStatus" = 'DELIVERED'
        WHERE ${delivered} AND o."deliveryFee" > 0
      )
      SELECT kind, hsn, rate,
        sum(quantity)::int AS quantity,
        sum(value) AS value,
        sum(tax) AS tax,
        coalesce(sum(round(tax / 2, 2)) FILTER (WHERE inter = false), 0) AS cgst,
        coalesce(sum(tax - round(tax / 2, 2)) FILTER (WHERE inter = false), 0) AS sgst,
        coalesce(sum(tax) FILTER (WHERE inter = true), 0) AS igst,
        coalesce(sum(tax) FILTER (WHERE inter IS NULL), 0) AS unsplit
      FROM lines
      GROUP BY kind, hsn, rate
      ORDER BY kind DESC, hsn NULLS LAST, rate NULLS LAST
    `;

    const totals = { value: zero(), tax: zero(), cgst: zero(), sgst: zero(), igst: zero(), unsplit: zero() };
    let csv = csvLine([
      "type",
      "hsn_sac",
      "gst_rate",
      "quantity",
      "taxable_value",
      "cgst",
      "sgst",
      "igst",
      "gst_not_split",
      "total_gst",
      "total_value",
    ]);
    for (const row of rows) {
      csv += csvLine([
        row.kind === "goods" ? "Goods" : "Delivery fee",
        row.hsn,
        row.rate,
        row.quantity,
        row.value.minus(row.tax),
        row.cgst,
        row.sgst,
        row.igst,
        row.unsplit,
        row.tax,
        row.value,
      ]);
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
        totals[key] = totals[key].plus(row[key]);
      }
    }
    return (
      csv +
      csvLine(["Total", null, null, null, totals.value.minus(totals.tax), totals.cgst, totals.sgst, totals.igst, totals.unsplit, totals.tax, totals.value])
    );
  }

  /**
   * Online payments received and refunds paid out (gateway, UPI or bank transfer), oldest first,
   * refunds as negative amounts. Streamed in batches; ends with the totals.
   */
  async function payments(query: ReportQuery) {
    return paymentLines(scope(query));
  }

  async function* paymentLines({ start, end }: ReturnType<typeof scope>) {
    yield csvLine(["date_time", "type", "order_number", "invoice_number", "method", "provider", "reference", "amount", "reason"]);

    const time = new Intl.DateTimeFormat("sv-SE", { timeZone: env.TIMEZONE, dateStyle: "short", timeStyle: "medium" });
    let received = zero();
    let refunded = zero();
    let cursor: { at: Date; id: string } | null = null;
    for (;;) {
      const after: Prisma.Sql = cursor ? Prisma.sql`WHERE (at, id) > (${cursor.at}, ${cursor.id})` : Prisma.empty;
      const rows: MoneyRow[] = await prisma.$queryRaw<MoneyRow[]>`
        SELECT * FROM (
          SELECT p."paidAt" AS at, p.id, 'PAYMENT' AS type, o."orderNumber", o."invoiceNumber",
            'ONLINE' AS method, p.provider, p."transactionId" AS reference, p.amount, NULL AS reason
          FROM "Payment" p
          JOIN "Order" o ON o.id = p."orderId"
          WHERE p.method = 'ONLINE' AND p."paidAt" >= ${start} AND p."paidAt" < ${end}
          UNION ALL
          SELECT r."createdAt", r.id, 'REFUND', o."orderNumber", o."invoiceNumber",
            r.method::text, CASE WHEN r.method = 'GATEWAY' THEN p.provider END, r.reference, -r.amount, r.reason
          FROM "Refund" r
          JOIN "Payment" p ON p.id = r."paymentId"
          JOIN "Order" o ON o.id = r."orderId"
          WHERE r."createdAt" >= ${start} AND r."createdAt" < ${end}
        ) money
        ${after}
        ORDER BY at, id
        LIMIT ${PAYMENTS_BATCH}
      `;
      let chunk = "";
      for (const row of rows) {
        if (row.type === "PAYMENT") received = received.plus(row.amount);
        else refunded = refunded.minus(row.amount);
        chunk += csvLine([
          time.format(row.at),
          row.type === "PAYMENT" ? "Payment" : "Refund",
          row.orderNumber,
          row.invoiceNumber,
          row.method,
          row.provider,
          row.reference,
          row.amount,
          row.reason,
        ]);
      }
      if (chunk) yield chunk;
      if (rows.length < PAYMENTS_BATCH) break;
      cursor = { at: rows.at(-1)!.at, id: rows.at(-1)!.id };
    }

    yield csvLine([]) +
      csvLine(["Online payments received", null, null, null, null, null, null, null, received, null]) +
      csvLine(["Refunds paid", null, null, null, null, null, null, null, zero().minus(refunded), null]) +
      csvLine(["Net", null, null, null, null, null, null, null, received.minus(refunded), null]);
  }

  return { dailySales, gstSummary, payments };
}
