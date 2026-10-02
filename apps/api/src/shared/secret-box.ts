import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "../config/env.js";

const VERSION = "v1";
const key = env.SECRETS_ENCRYPTION_KEY ? createHash("sha256").update(env.SECRETS_ENCRYPTION_KEY).digest() : null;

/** True when SECRETS_ENCRYPTION_KEY is set, so secrets can be stored in the database. */
export const canStoreSecrets = key !== null;

/**
 * AES-256-GCM. `context` is bound to the ciphertext (e.g. the gateway name), so a value saved for
 * one gateway cannot be copied into another's row.
 */
export function sealSecret(plaintext: string, context: string) {
  if (!key) throw new Error("SECRETS_ENCRYPTION_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv).setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

/** Returns null when the key is missing or different from the one that sealed the value. */
export function openSecret(sealed: string, context: string) {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (!key || version !== VERSION || !iv || !tag || !ciphertext) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"))
      .setAAD(Buffer.from(context))
      .setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
