import PDFDocument from "pdfkit";

import { env } from "../../config/env.js";
import type { Prisma } from "../../generated/prisma/client";
import type { Invoice, InvoiceLine } from "./invoice.js";

type Column = {
  label: string;
  width: number;
  align: "left" | "right";
  value: (line: InvoiceLine, index: number) => string;
};

const MARGIN = 36;
const TABLE_FONT_SIZE = 7.5;
const CELL_PADDING = 3;
const MUTED = "#555555";
const RULE = "#cccccc";

// The built-in PDF fonts only cover Western European characters; others print as "?".
const printable = (text: string) => text.replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "?");

/** "1,23,456.50": Indian digit grouping, always two decimals. */
export function formatAmount(amount: Prisma.Decimal) {
  const [whole, fraction] = amount.toFixed(2).split(".") as [string, string];
  const negative = whole.startsWith("-");
  const digits = negative ? whole.slice(1) : whole;
  const head = digits.slice(0, -3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${digits.slice(-3)}` : digits;
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

const rate = (value: Prisma.Decimal | null) => (value === null ? "-" : `${value.toDecimalPlaces(2).toString()}%`);

function columns(doc: PDFKit.PDFDocument, invoice: Invoice, width: number): Column[] {
  const taxColumns: Column[] =
    invoice.interState === false
      ? [
          { label: "CGST", width: 40, align: "right", value: (line) => formatAmount(line.cgst) },
          { label: "SGST", width: 40, align: "right", value: (line) => formatAmount(line.sgst) },
        ]
      : invoice.interState
        ? [{ label: "IGST", width: 48, align: "right", value: (line) => formatAmount(line.igst) }]
        : [{ label: "GST", width: 48, align: "right", value: (line) => formatAmount(line.tax) }];
  const fixed: Column[] = [
    { label: "#", width: 16, align: "left", value: (_line, index) => String(index + 1) },
    { label: "Item", width: 0, align: "left", value: (line) => line.description },
    { label: "HSN/SAC", width: 42, align: "left", value: (line) => line.hsn },
    { label: "Qty", width: 26, align: "right", value: (line) => (line.quantity === null ? "" : String(line.quantity)) },
    { label: "Unit price", width: 44, align: "right", value: (line) => (line.unitPrice ? formatAmount(line.unitPrice) : "") },
    { label: "Discount", width: 40, align: "right", value: (line) => (line.discount.gt(0) ? formatAmount(line.discount) : "") },
    { label: "Taxable value", width: 50, align: "right", value: (line) => formatAmount(line.taxable) },
    { label: "GST %", width: 32, align: "right", value: (line) => rate(line.rate) },
    ...taxColumns,
    { label: "Total", width: 50, align: "right", value: (line) => formatAmount(line.total) },
  ];
  // Amounts never wrap: a column widens to its longest value or header word, and the item column takes what is left.
  const fit = (column: Column) => {
    doc.font("Helvetica").fontSize(TABLE_FONT_SIZE);
    const values = invoice.lines.map((line, index) => doc.widthOfString(printable(column.value(line, index))));
    doc.font("Helvetica-Bold");
    const words = column.label.split(" ").map((word) => doc.widthOfString(word));
    return Math.max(column.width, Math.ceil(Math.max(...values, ...words)) + CELL_PADDING * 2);
  };
  const sized = fixed.map((column) => (column.label === "Item" ? column : { ...column, width: fit(column) }));
  const used = sized.reduce((sum, column) => sum + column.width, 0);
  return sized.map((column) => (column.label === "Item" ? { ...column, width: width - used } : column));
}

/** Renders the GST invoice as an A4 PDF. */
export function renderInvoicePdf(invoice: Invoice): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    bufferPages: true,
    info: { Title: `Invoice ${invoice.invoiceNumber}`, Author: printable(invoice.seller?.name ?? "") },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = MARGIN;
  const width = doc.page.width - MARGIN * 2;
  const bottom = () => doc.page.height - MARGIN;
  const text = (value: string, x: number, y: number, options: PDFKit.Mixins.TextOptions = {}) => doc.text(printable(value), x, y, options);

  // Seller and title
  const title = invoice.seller ? "TAX INVOICE" : "INVOICE";
  doc.font("Helvetica-Bold").fontSize(16).fillColor("black");
  text(title, left, MARGIN, { width, align: "right" });
  doc.fontSize(12);
  if (invoice.seller) {
    text(invoice.seller.name, left, MARGIN, { width: width * 0.6 });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    text(invoice.seller.address, left, doc.y + 2, { width: width * 0.6 });
    doc.fillColor("black");
    text(invoice.seller.gstin ? `GSTIN: ${invoice.seller.gstin}` : "GSTIN: not registered", left, doc.y + 2, { width: width * 0.6 });
  } else {
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    text("Seller details were not recorded for this order.", left, MARGIN, { width: width * 0.6 });
    doc.fillColor("black");
  }

  // Invoice details and customer
  let y = Math.max(doc.y, MARGIN + 24) + 14;
  doc.moveTo(left, y).lineTo(left + width, y).strokeColor(RULE).lineWidth(0.75).stroke();
  y += 8;
  const half = width / 2 - 8;
  const details: [string, string][] = [
    ["Invoice number", invoice.invoiceNumber],
    ["Invoice date", invoice.invoiceDate],
    ["Order number", invoice.orderNumber],
    ["Order date", invoice.orderDate],
    ["Payment", invoice.paymentMethod],
    ["Place of supply", invoice.buyer.placeOfSupply],
    ["Reverse charge", "No"],
  ];
  doc.fontSize(8.5);
  let detailsY = y;
  for (const [label, value] of details) {
    doc.font("Helvetica").fillColor(MUTED);
    text(label, left, detailsY, { width: 80 });
    doc.font("Helvetica-Bold").fillColor("black");
    text(value, left + 82, detailsY, { width: half - 82 });
    detailsY = doc.y + 2;
  }
  const buyerX = left + width / 2 + 8;
  doc.font("Helvetica").fillColor(MUTED);
  text("Bill to", buyerX, y, { width: half });
  doc.font("Helvetica-Bold").fillColor("black").fontSize(10);
  text(invoice.buyer.name, buyerX, doc.y + 1, { width: half });
  doc.font("Helvetica").fontSize(8.5);
  text(invoice.buyer.address, buyerX, doc.y + 1, { width: half });
  text(invoice.buyer.phone, buyerX, doc.y + 1, { width: half });
  y = Math.max(detailsY, doc.y) + 10;

  if (!invoice.seller) {
    const notice =
      "This order was delivered before seller details (legal name, GSTIN and store address) were recorded on orders, so they are not shown, and GST is not split into CGST, SGST or IGST.";
    doc.font("Helvetica").fontSize(8.5);
    const height = doc.heightOfString(notice, { width: width - 16 }) + 12;
    doc.rect(left, y, width, height).fillColor("#fff7e0").fill();
    doc.fillColor("black");
    text(notice, left + 8, y + 6, { width: width - 16 });
    y += height + 10;
  }

  // Lines
  const cols = columns(doc, invoice, width);
  const drawRow = (cells: string[], header: boolean) => {
    const font = header ? "Helvetica-Bold" : "Helvetica";
    doc.font(font).fontSize(TABLE_FONT_SIZE);
    const height =
      Math.max(...cells.map((cell, index) => doc.heightOfString(printable(cell), { width: cols[index]!.width - CELL_PADDING * 2 }))) +
      CELL_PADDING * 2;
    if (y + height > bottom()) {
      doc.addPage();
      y = MARGIN;
      if (!header) drawHeader();
      doc.font(font).fontSize(TABLE_FONT_SIZE);
    }
    if (header) doc.rect(left, y, width, height).fillColor("#f2f2f2").fill();
    doc.fillColor("black");
    let x = left;
    cells.forEach((cell, index) => {
      const column = cols[index]!;
      text(cell, x + CELL_PADDING, y + CELL_PADDING, { width: column.width - CELL_PADDING * 2, align: column.align });
      x += column.width;
    });
    y += height;
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor(RULE).lineWidth(0.5).stroke();
  };
  const drawHeader = () => drawRow(cols.map((column) => column.label), true);

  drawHeader();
  invoice.lines.forEach((line, index) => drawRow(cols.map((column) => column.value(line, index)), false));

  // Totals
  const totals: [string, Prisma.Decimal, boolean][] = [
    ["Taxable value", invoice.totals.taxable, false],
    ...(invoice.interState === false
      ? ([
          ["CGST", invoice.totals.cgst, false],
          ["SGST", invoice.totals.sgst, false],
        ] as [string, Prisma.Decimal, boolean][])
      : invoice.interState
        ? ([["IGST", invoice.totals.igst, false]] as [string, Prisma.Decimal, boolean][])
        : []),
    ["Total GST", invoice.totals.tax, false],
    [`Invoice total (${env.CURRENCY})`, invoice.totals.total, true],
  ];
  y += 8;
  if (y + totals.length * 14 + 60 > bottom()) {
    doc.addPage();
    y = MARGIN;
  }
  const labelX = left + width - 240;
  for (const [label, amount, strong] of totals) {
    doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 10 : 8.5);
    text(label, labelX, y, { width: 150 });
    text(formatAmount(amount), labelX + 150, y, { width: 90, align: "right" });
    y = doc.y + 4;
  }

  y += 6;
  doc.font("Helvetica-Bold").fontSize(8.5);
  text("Amount in words: ", left, y, { width, continued: true });
  doc.font("Helvetica").text(printable(invoice.amountInWords));
  y = doc.y + 14;
  doc.fontSize(7.5).fillColor(MUTED);
  text("Prices include GST. This is a computer-generated invoice and needs no signature.", left, y, { width });

  const pages = doc.bufferedPageRange();
  if (pages.count > 1) {
    for (let index = 0; index < pages.count; index++) {
      doc.switchToPage(pages.start + index);
      // Writing inside the bottom margin would otherwise start a new page.
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
      text(`${invoice.invoiceNumber} · Page ${index + 1} of ${pages.count}`, left, doc.page.height - MARGIN + 12, { width, align: "right" });
    }
  }

  doc.end();
  return done;
}
