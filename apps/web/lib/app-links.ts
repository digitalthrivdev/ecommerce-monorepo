import "server-only";

/** Paths on this site that the customer app opens when it's installed (App Links and Universal Links). */
export const APP_LINK_PATH = "/p/";

const FINGERPRINT_PATTERN = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const IOS_APP_ID_PATTERN = /^[A-Z0-9]{10}\.[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)+$/;

/**
 * ANDROID_APP_ID is the customer app's package; ANDROID_CERT_SHA256 lists the SHA-256 fingerprints of
 * its signing keys, comma-separated (the EAS keystore, and Google Play's app signing key once it's on Play).
 */
export function androidApp() {
  const packageName = process.env.ANDROID_APP_ID?.trim();
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const invalid = fingerprints.filter((value) => !FINGERPRINT_PATTERN.test(value));
  if (invalid.length > 0) console.error(`ANDROID_CERT_SHA256 has values that aren't SHA-256 fingerprints: ${invalid.join(", ")}`);

  const valid = fingerprints.filter((value) => FINGERPRINT_PATTERN.test(value));
  return packageName && valid.length > 0 ? { packageName, fingerprints: valid } : null;
}

/** IOS_APP_ID is "<Apple Team ID>.<bundle ID>", e.g. "AB12CD34EF.com.acme.grocery". */
export function iosAppId() {
  const value = process.env.IOS_APP_ID?.trim();
  if (!value) return null;
  if (IOS_APP_ID_PATTERN.test(value)) return value;
  console.error(`IOS_APP_ID="${value}" is not "<Team ID>.<bundle ID>"`);
  return null;
}
