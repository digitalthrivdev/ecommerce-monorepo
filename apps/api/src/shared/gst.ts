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

// GST state codes, keyed by the state name in lowercase letters only. Older codes still on some
// registrations come second (Andhra Pradesh 28, Daman and Diu 25).
const STATE_CODES: Record<string, string[]> = {
  jammuandkashmir: ["01"],
  himachalpradesh: ["02"],
  punjab: ["03"],
  chandigarh: ["04"],
  uttarakhand: ["05"],
  uttaranchal: ["05"],
  haryana: ["06"],
  delhi: ["07"],
  newdelhi: ["07"],
  nctofdelhi: ["07"],
  rajasthan: ["08"],
  uttarpradesh: ["09"],
  bihar: ["10"],
  sikkim: ["11"],
  arunachalpradesh: ["12"],
  nagaland: ["13"],
  manipur: ["14"],
  mizoram: ["15"],
  tripura: ["16"],
  meghalaya: ["17"],
  assam: ["18"],
  westbengal: ["19"],
  jharkhand: ["20"],
  odisha: ["21"],
  orissa: ["21"],
  chhattisgarh: ["22"],
  chattisgarh: ["22"],
  madhyapradesh: ["23"],
  gujarat: ["24"],
  dadraandnagarhavelianddamananddiu: ["26", "25"],
  dadraandnagarhaveli: ["26"],
  damananddiu: ["26", "25"],
  maharashtra: ["27"],
  karnataka: ["29"],
  goa: ["30"],
  lakshadweep: ["31"],
  kerala: ["32"],
  tamilnadu: ["33"],
  puducherry: ["34"],
  pondicherry: ["34"],
  andamanandnicobarislands: ["35"],
  andamanandnicobar: ["35"],
  telangana: ["36"],
  andhrapradesh: ["37", "28"],
  ladakh: ["38"],
};

const KNOWN_CODES = new Set([...Object.values(STATE_CODES).flat(), "97", "99"]);

function normalizeState(state: string) {
  return state.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
}

/** GST codes of a state name ("Karnataka" → ["29"]), or null when the name is not recognised. */
export function stateCodes(state: string) {
  return STATE_CODES[normalizeState(state)] ?? null;
}

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
