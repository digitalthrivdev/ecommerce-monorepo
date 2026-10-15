import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client";
import { splitIntraState, stateCodes } from "../../shared/gst.js";

/** SAC for courier and cash-on-delivery charges. */
export const DELIVERY_SAC = "996813";

export const invoiceSelect = {
  id: true,
  orderNumber: true,
  status: true,
  invoiceNumber: true,
  paymentMethod: true,
  createdAt: true,
  customerName: true,
  customerPhone: true,
  addressLine1: true,
  addressLine2: true,
  landmark: true,
  city: true,
  state: true,
  postalCode: true,
  shippingFee: true,
  shippingFeeGstRate: true,
  shippingFeeTax: true,
  codFee: true,
  codFeeTax: true,
  total: true,
  sellerName: true,
  sellerGstin: true,
  sellerAddress: true,
  interStateSupply: true,
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      productName: true,
      variantName: true,
      hsnCode: true,
      gstRate: true,
      quantity: true,
      unavailableQuantity: true,
      unitPrice: true,
      discount: true,
      taxAmount: true,
    },
  },
  invoicedAt: true,
} satisfies Prisma.OrderSelect;

export type InvoiceOrder = Prisma.OrderGetPayload<{ select: typeof invoiceSelect }>;

export type InvoiceLine = {
  description: string;
  hsn: string;
  quantity: number | null;
  unitPrice: Prisma.Decimal | null;
  discount: Prisma.Decimal;
  taxable: Prisma.Decimal;
  rate: Prisma.Decimal | null;
  cgst: Prisma.Decimal;
  sgst: Prisma.Decimal;
  igst: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
};

const zero = () => new Prisma.Decimal(0);

function invoiceLine(
  base: Omit<InvoiceLine, "taxable" | "cgst" | "sgst" | "igst" | "total">,
  amount: Prisma.Decimal,
  interState: boolean | null,
): InvoiceLine {
  const total = amount.minus(base.discount);
  const split = interState === false ? splitIntraState(base.tax) : { cgst: zero(), sgst: zero() };
  return { ...base, taxable: total.minus(base.tax), ...split, igst: interState ? base.tax : zero(), total };
}

export function formatInvoiceDate(date: Date) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: env.TIMEZONE, day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function stateWithCode(state: string) {
  const code = stateCodes(state)?.[0];
  return code ? `${state} (${code})` : state;
}

/**
 * Everything printed on the invoice, from the order's own snapshots only. Units that could not be
 * supplied are left out; each line's coupon share lowers its taxable value. `seller` is null for
 * orders invoiced without a pickup location: their GST is shown without the split.
 */
export function buildInvoice(order: InvoiceOrder) {
  const interState = order.interStateSupply;
  const lines = order.items.flatMap((item) => {
    const supplied = item.quantity - item.unavailableQuantity;
    if (supplied <= 0) return [];
    return [
      invoiceLine(
        {
          description: item.variantName ? `${item.productName} (${item.variantName})` : item.productName,
          hsn: item.hsnCode ?? "",
          quantity: supplied,
          unitPrice: item.unitPrice,
          discount: item.discount,
          rate: item.gstRate,
          tax: item.taxAmount,
        },
        item.unitPrice.mul(supplied),
        interState,
      ),
    ];
  });
  const feeLine = (description: string, amount: Prisma.Decimal, tax: Prisma.Decimal) =>
    invoiceLine(
      {
        description,
        hsn: DELIVERY_SAC,
        quantity: null,
        unitPrice: null,
        discount: zero(),
        rate: order.shippingFeeGstRate,
        tax,
      },
      amount,
      interState,
    );
  if (order.shippingFee.gt(0)) lines.push(feeLine("Shipping charges", order.shippingFee, order.shippingFeeTax));
  if (order.codFee.gt(0)) lines.push(feeLine("Cash on delivery charges", order.codFee, order.codFeeTax));

  const sum = (key: "taxable" | "cgst" | "sgst" | "igst" | "tax" | "total") => lines.reduce((total, line) => total.plus(line[key]), zero());
  const address = [order.addressLine1, order.addressLine2, order.landmark && `Near ${order.landmark}`, order.city, `${order.state} ${order.postalCode}`]
    .filter(Boolean)
    .join(", ");

  return {
    invoiceNumber: order.invoiceNumber!,
    invoiceDate: order.invoicedAt ? formatInvoiceDate(order.invoicedAt) : "",
    orderNumber: order.orderNumber,
    orderDate: formatInvoiceDate(order.createdAt),
    paymentMethod: order.paymentMethod === "COD" ? "Cash on delivery" : "Paid online",
    seller:
      order.sellerAddress !== null
        ? { name: order.sellerName ?? "", gstin: order.sellerGstin, address: order.sellerAddress }
        : null,
    interState,
    buyer: { name: order.customerName, phone: order.customerPhone, address, placeOfSupply: stateWithCode(order.state) },
    lines,
    totals: { taxable: sum("taxable"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), tax: sum("tax"), total: order.total },
    amountInWords: amountInWords(order.total),
  };
}

export type Invoice = ReturnType<typeof buildInvoice>;

export function invoiceFileName(invoiceNumber: string) {
  return `${invoiceNumber.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number) {
  return n < 20 ? ONES[n]! : [TENS[Math.floor(n / 10)]!, ONES[n % 10]!].filter(Boolean).join(" ");
}

function belowThousand(n: number) {
  return [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : "", n % 100 ? belowHundred(n % 100) : ""].filter(Boolean).join(" ");
}

/** Whole number in words with the Indian system: crore, lakh, thousand. */
function indianWords(n: number): string {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor(n / 100_000) % 100;
  const thousand = Math.floor(n / 1000) % 100;
  return [
    crore ? `${indianWords(crore)} Crore` : "",
    lakh ? `${belowHundred(lakh)} Lakh` : "",
    thousand ? `${belowHundred(thousand)} Thousand` : "",
    n % 1000 ? belowThousand(n % 1000) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** "Rupees One Hundred Twenty and Fifty Paise Only". */
export function amountInWords(amount: Prisma.Decimal) {
  const [whole, fraction] = amount.toFixed(2).split(".") as [string, string];
  const paise = Number(fraction);
  const [major, minor] = env.CURRENCY === "INR" ? ["Rupees", "Paise"] : [env.CURRENCY, "Cents"];
  return `${major} ${indianWords(Number(whole))}${paise ? ` and ${belowHundred(paise)} ${minor}` : ""} Only`;
}
