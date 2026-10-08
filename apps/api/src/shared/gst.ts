import { z } from "zod";

import { Prisma } from "../generated/prisma/client";

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Regular taxpayers: state code, PAN (5 letters, 4 digits, 1 letter), entity number, "Z", checksum.
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Check character of the first 14 characters of a GSTIN (Luhn mod 36). */
export function gstinCheckChar(first14: string) {
  let sum = 0;
  for (let index = 0; index < 14; index++) {
    const product = GSTIN_CHARS.indexOf(first14[index]!) * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36]!;
}

/**
 * States and union territories with their GST codes. Older codes still on some registrations come
 * second (Andhra Pradesh 28, Daman and Diu 25). The admin and customer apps list the same names.
 */
export const INDIAN_STATES: { name: string; codes: string[] }[] = [
  { name: "Andaman and Nicobar Islands", codes: ["35"] },
  { name: "Andhra Pradesh", codes: ["37", "28"] },
  { name: "Arunachal Pradesh", codes: ["12"] },
  { name: "Assam", codes: ["18"] },
  { name: "Bihar", codes: ["10"] },
  { name: "Chandigarh", codes: ["04"] },
  { name: "Chhattisgarh", codes: ["22"] },
  { name: "Dadra and Nagar Haveli and Daman and Diu", codes: ["26", "25"] },
  { name: "Delhi", codes: ["07"] },
  { name: "Goa", codes: ["30"] },
  { name: "Gujarat", codes: ["24"] },
  { name: "Haryana", codes: ["06"] },
  { name: "Himachal Pradesh", codes: ["02"] },
  { name: "Jammu and Kashmir", codes: ["01"] },
  { name: "Jharkhand", codes: ["20"] },
  { name: "Karnataka", codes: ["29"] },
  { name: "Kerala", codes: ["32"] },
  { name: "Ladakh", codes: ["38"] },
  { name: "Lakshadweep", codes: ["31"] },
  { name: "Madhya Pradesh", codes: ["23"] },
  { name: "Maharashtra", codes: ["27"] },
  { name: "Manipur", codes: ["14"] },
  { name: "Meghalaya", codes: ["17"] },
  { name: "Mizoram", codes: ["15"] },
  { name: "Nagaland", codes: ["13"] },
  { name: "Odisha", codes: ["21"] },
  { name: "Puducherry", codes: ["34"] },
  { name: "Punjab", codes: ["03"] },
  { name: "Rajasthan", codes: ["08"] },
  { name: "Sikkim", codes: ["11"] },
  { name: "Tamil Nadu", codes: ["33"] },
  { name: "Telangana", codes: ["36"] },
  { name: "Tripura", codes: ["16"] },
  { name: "Uttar Pradesh", codes: ["09"] },
  { name: "Uttarakhand", codes: ["05"] },
  { name: "West Bengal", codes: ["19"] },
];

function normalizeState(state: string) {
  return state.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
}

// Older and alternative names that phones' geocoders and existing addresses use.
const ALIASES: Record<string, string> = {
  andamanandnicobar: "Andaman and Nicobar Islands",
  chattisgarh: "Chhattisgarh",
  dadraandnagarhaveli: "Dadra and Nagar Haveli and Daman and Diu",
  damananddiu: "Dadra and Nagar Haveli and Daman and Diu",
  newdelhi: "Delhi",
  nctofdelhi: "Delhi",
  nationalcapitalterritoryofdelhi: "Delhi",
  orissa: "Odisha",
  pondicherry: "Puducherry",
  uttaranchal: "Uttarakhand",
};

const BY_NAME = new Map(INDIAN_STATES.map((state) => [normalizeState(state.name), state]));
const KNOWN_CODES = new Set([...INDIAN_STATES.flatMap((state) => state.codes), "97", "99"]);

function findState(state: string) {
  const normalized = normalizeState(state);
  return BY_NAME.get(normalized) ?? BY_NAME.get(normalizeState(ALIASES[normalized] ?? "")) ?? null;
}

/** The standard name of a state or union territory ("orissa" → "Odisha"), or null when not recognised. */
export function canonicalState(state: string) {
  return findState(state)?.name ?? null;
}

/** GST codes of a state name ("Karnataka" → ["29"]), or null when the name is not recognised. */
export function stateCodes(state: string) {
  return findState(state)?.codes ?? null;
}

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

/** Same state for GST: by state code when both names are recognised, otherwise by name. */
export function isSameState(a: string, b: string) {
  const codesA = stateCodes(a);
  const codesB = stateCodes(b);
  if (codesA && codesB) return codesA[0] === codesB[0];
  return normalizeState(a) === normalizeState(b);
}

/** Whether a GSTIN can belong to a business in this state; true when the state name is not recognised. */
export function gstinMatchesState(gstin: string, state: string) {
  const codes = stateCodes(state);
  return !codes || codes.includes(gstin.slice(0, 2));
}

/**
 * The GSTIN on invoices from a store: its own, else the one in settings when that is registered in
 * the store's state. A store in another state without its own GSTIN has none.
 */
export function storeInvoiceGstin(store: { gstin: string | null; state: string }, settingsGstin: string | null) {
  return store.gstin ?? (settingsGstin && gstinMatchesState(settingsGstin, store.state) ? settingsGstin : null);
}

export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(GSTIN_PATTERN, "Enter the 15-character GSTIN, e.g. 29ABCDE1234F1ZW")
  .refine((gstin) => !GSTIN_PATTERN.test(gstin) || KNOWN_CODES.has(gstin.slice(0, 2)), "The first two digits are not a GST state code")
  .refine((gstin) => !GSTIN_PATTERN.test(gstin) || gstinCheckChar(gstin) === gstin[14], "This GSTIN has a typo: its last character does not match");

/** Splits GST into CGST and SGST halves; the odd paisa goes to CGST so they add up. */
export function splitIntraState(tax: Prisma.Decimal) {
  const cgst = tax.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { cgst, sgst: tax.minus(cgst) };
}
