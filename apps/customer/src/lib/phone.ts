import { PHONE_COUNTRY_CODE, PHONE_NATIONAL_LENGTH } from "./config";

export const toE164 = (nationalNumber: string) => `${PHONE_COUNTRY_CODE}${nationalNumber}`;

export const isValidNationalNumber = (digits: string) => new RegExp(`^[1-9]\\d{${PHONE_NATIONAL_LENGTH - 1}}$`).test(digits);

/** "+919876543210" → "+91 98765 43210" for the default 10-digit numbers; other lengths are left grouped once. */
export function formatPhone(e164: string) {
  if (!e164.startsWith(PHONE_COUNTRY_CODE)) return e164;
  const national = e164.slice(PHONE_COUNTRY_CODE.length);
  const grouped = national.length === 10 ? `${national.slice(0, 5)} ${national.slice(5)}` : national;
  return `${PHONE_COUNTRY_CODE} ${grouped}`;
}
