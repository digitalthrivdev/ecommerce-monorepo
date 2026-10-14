import { canonicalState, gstinMatchesState, gstinProblem } from "@shop/validation";
import { z } from "zod";

import { Prisma } from "../generated/prisma/client";

export { canonicalState, gstinCheckChar, gstinMatchesState, INDIAN_STATES, isSameState, stateCodes } from "@shop/validation";

/** A state or union territory of India, saved under its standard name. */
export const stateSchema = z
  .string()
  .trim()
  .max(100)
  .transform((value, ctx) => {
    const state = canonicalState(value);
    if (!state) {
      ctx.addIssue({ code: "custom", message: "Choose a state or union territory of India" });
      return z.NEVER;
    }
    return state;
  });

/**
 * The GSTIN on invoices from a store: its own, else the one in settings when that is registered in
 * the store's state. A store in another state without its own GSTIN has none.
 */
export function storeInvoiceGstin(store: { gstin: string | null; state: string }, settingsGstin: string | null) {
  return store.gstin ?? (settingsGstin && gstinMatchesState(settingsGstin, store.state) ? settingsGstin : null);
}

const GSTIN_MESSAGES = {
  format: "Enter the 15-character GSTIN, e.g. 29ABCDE1234F1ZW",
  "state-code": "The first two digits are not a GST state code",
  "check-character": "This GSTIN has a typo: its last character does not match",
};

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .superRefine((gstin, ctx) => {
    const problem = gstinProblem(gstin);
    if (problem) ctx.addIssue({ code: "custom", message: GSTIN_MESSAGES[problem] });
  });

/** Splits GST into CGST and SGST halves; the odd paisa goes to CGST so they add up. */
export function splitIntraState(tax: Prisma.Decimal) {
  const cgst = tax.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { cgst, sgst: tax.minus(cgst) };
}
