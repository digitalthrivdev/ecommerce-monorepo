/**
 * Input rules shared by the API and the dashboard, so both accept exactly the same values. Each
 * side writes its own error messages.
 *
 * The API loads this file directly with Node's type stripping, without a build step: keep it one
 * file of erasable TypeScript (no enums, namespaces or parameter properties) with no dependencies.
 */

/** Phone number in E.164 format, e.g. +919876543210. */
export const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

/** Lowercase letters, digits and single dashes, e.g. "fresh-fruits". */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** An amount of money or a quantity with up to 2 decimals, as a string, e.g. "68.00". */
export const DECIMAL_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

/** A GST rate in percent with up to 2 decimals, e.g. "5" or "18". */
export const GST_RATE_PATTERN = /^\d{1,2}(\.\d{1,2})?$/;

export const HSN_PATTERN = /^\d{4,8}$/;

/** Upper case, e.g. TSHIRT-M-BLUE. */
export const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;

export const BARCODE_PATTERN = /^[0-9A-Za-z-]{4,32}$/;

/** Indian postal code (PIN): 6 digits, not starting with 0. */
export const PINCODE_PATTERN = /^[1-9]\d{5}$/;

/** Upper case, e.g. WELCOME50. */
export const COUPON_CODE_PATTERN = /^[A-Z0-9]{3,20}$/;

export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/**
 * States and union territories with their GST codes. Older codes still on some registrations come
 * second (Andhra Pradesh 28, Daman and Diu 25).
 */
export const INDIAN_STATES: readonly { name: string; codes: readonly string[] }[] = [
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

/** Same state for GST: by state code when both names are recognised, otherwise by name. */
export function isSameState(a: string, b: string) {
  const codesA = stateCodes(a);
  const codesB = stateCodes(b);
  if (codesA && codesB) return codesA[0] === codesB[0];
  return normalizeState(a) === normalizeState(b);
}

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Regular taxpayers: state code, PAN (5 letters, 4 digits, 1 letter), entity number, "Z", check character. */
export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// 97: other territory, 99: centre jurisdiction.
const GST_STATE_CODES = new Set([...INDIAN_STATES.flatMap((state) => state.codes), "97", "99"]);

/** Check character of the first 14 characters of a GSTIN (Luhn mod 36). */
export function gstinCheckChar(first14: string) {
  let sum = 0;
  for (let index = 0; index < 14; index++) {
    const product = GSTIN_CHARS.indexOf(first14[index]!) * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36]!;
}

/** What is wrong with an upper-case GSTIN, or null when it is valid. */
export function gstinProblem(gstin: string): "format" | "state-code" | "check-character" | null {
  if (!GSTIN_PATTERN.test(gstin)) return "format";
  if (!GST_STATE_CODES.has(gstin.slice(0, 2))) return "state-code";
  if (gstinCheckChar(gstin) !== gstin[14]) return "check-character";
  return null;
}

/** Whether a GSTIN can belong to a business in this state; true when the state name is not recognised. */
export function gstinMatchesState(gstin: string, state: string) {
  const codes = stateCodes(state);
  return !codes || codes.includes(gstin.slice(0, 2));
}
