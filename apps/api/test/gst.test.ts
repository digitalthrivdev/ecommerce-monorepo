import { describe, expect, it } from "vitest";

import { Prisma } from "../src/generated/prisma/client";
import { discountShares, financialYear, includedTax } from "../src/modules/orders/tax.js";
import {
  canonicalState,
  gstinMatchesState,
  gstinSchema,
  isSameState,
  splitIntraState,
  stateSchema,
  storeInvoiceGstin,
} from "../src/shared/gst.js";

const D = (value: string) => new Prisma.Decimal(value);

describe("GSTIN", () => {
  it("accepts a valid GSTIN pasted in lowercase with spaces", () => {
    expect(gstinSchema.parse(" 29abcde1234f1zw ")).toBe("29ABCDE1234F1ZW");
  });

  it.each([
    ["too short", "29ABCDE1234", /15-character/],
    ["wrong check character", "29ABCDE1234F1ZX", /last character/],
    ["unknown state code", "00AAPFU0939F1ZB", /state code/],
  ])("rejects a GSTIN that is %s", (_label, gstin, message) => {
    const result = gstinSchema.safeParse(gstin);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(message);
  });

  it("matches a GSTIN to its state, including older state codes", () => {
    expect(gstinMatchesState("29ABCDE1234F1ZW", "Karnataka")).toBe(true);
    expect(gstinMatchesState("29ABCDE1234F1ZW", "Uttar Pradesh")).toBe(false);
    expect(gstinMatchesState("28ABCDE1234F1Z0", "Andhra Pradesh")).toBe(true);
  });

  it("uses the settings GSTIN only for stores in its state", () => {
    expect(storeInvoiceGstin({ gstin: null, state: "Karnataka" }, "29ABCDE1234F1ZW")).toBe("29ABCDE1234F1ZW");
    expect(storeInvoiceGstin({ gstin: null, state: "Uttar Pradesh" }, "29ABCDE1234F1ZW")).toBeNull();
    expect(storeInvoiceGstin({ gstin: "27AAPFU0939F1ZV", state: "Maharashtra" }, "29ABCDE1234F1ZW")).toBe("27AAPFU0939F1ZV");
    expect(storeInvoiceGstin({ gstin: null, state: "Karnataka" }, null)).toBeNull();
  });
});

describe("state names", () => {
  it.each([
    ["karnataka", "Karnataka"],
    ["Orissa", "Odisha"],
    ["New Delhi", "Delhi"],
    ["Jammu & Kashmir", "Jammu and Kashmir"],
    ["Pondicherry", "Puducherry"],
  ])("saves %s as %s", (input, expected) => {
    expect(stateSchema.parse(input)).toBe(expected);
  });

  it("rejects a name that is not an Indian state", () => {
    const result = stateSchema.safeParse("Atlantis");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Choose a state or union territory of India");
    expect(canonicalState("Atlantis")).toBeNull();
  });

  it("compares states by GST code", () => {
    expect(isSameState("Orissa", "Odisha")).toBe(true);
    expect(isSameState("Karnataka", "Kerala")).toBe(false);
  });
});

describe("tax arithmetic", () => {
  it("takes the GST out of a price that includes it", () => {
    expect(includedTax(D("118.00"), D("18")).toFixed(2)).toBe("18.00");
    expect(includedTax(D("105.00"), D("5")).toFixed(2)).toBe("5.00");
    expect(includedTax(D("100.00"), D("0")).toFixed(2)).toBe("0.00");
    expect(includedTax(D("100.00"), null).toFixed(2)).toBe("0.00");
  });

  it("splits GST into CGST and SGST that add up, odd paisa to CGST", () => {
    const { cgst, sgst } = splitIntraState(D("5.01"));
    expect(cgst.toFixed(2)).toBe("2.51");
    expect(sgst.toFixed(2)).toBe("2.50");
  });

  it("spreads a discount over lines so the shares add up exactly", () => {
    const shares = discountShares([D("10.00"), D("20.00"), D("30.00")], D("10.00"));
    expect(shares.reduce((sum, share) => sum.plus(share), D("0")).toFixed(2)).toBe("10.00");
    expect(shares.map((share) => share.toFixed(2))).toEqual(["1.66", "3.33", "5.01"]);
  });

  it("names the Indian financial year, April to March", () => {
    expect(financialYear(new Date("2026-03-31T12:00:00Z"))).toBe("2025-26");
    expect(financialYear(new Date("2026-04-01T12:00:00Z"))).toBe("2026-27");
    // 31 March 19:00 UTC is already 1 April in India.
    expect(financialYear(new Date("2026-03-31T19:00:00Z"), "Asia/Kolkata")).toBe("2026-27");
  });
});
