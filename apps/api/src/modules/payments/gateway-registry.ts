import { env } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { GATEWAYS, type Credentials, type GatewayDefinition, type PaymentProvider } from "./payment-provider.js";
import { canStoreSecrets, openSecret, sealSecret } from "./secret-box.js";

/**
 * The gateways this deployment can use: credentials from the server environment take priority,
 * otherwise keys an admin saved in the dashboard. Cached briefly so every payment request does not
 * decrypt keys; a save clears the cache on this instance, other instances pick it up within CACHE_MS.
 */
const CACHE_MS = 30_000;

type LoadedGateway = {
  definition: GatewayDefinition;
  provider: PaymentProvider | null;
  source: "env" | "dashboard" | null;
  /** Never leaves this module except to merge an admin's edit. */
  credentials: Credentials | null;
  stored: { updatedAt: Date; readable: boolean } | null;
};

let cache: { expires: number; gateways: Promise<Map<string, LoadedGateway>> } | null = null;

function readStored(definition: GatewayDefinition, sealed: string) {
  const plaintext = openSecret(sealed, definition.name);
  if (!plaintext) return null;
  try {
    return definition.parse(JSON.parse(plaintext) as Record<string, string>);
  } catch {
    return null;
  }
}

function createProvider(definition: GatewayDefinition, credentials: Credentials | null) {
  if (!credentials) return null;
  try {
    return definition.create(credentials);
  } catch {
    // Malformed keys (e.g. a mistyped environment value) leave just this gateway unavailable.
    return null;
  }
}

async function load(prisma: PrismaClient) {
  const rows = new Map((await prisma.paymentGatewayCredential.findMany()).map((row) => [row.gateway, row]));

  return new Map(
    GATEWAYS.map((definition): [string, LoadedGateway] => {
      const row = rows.get(definition.name);
      const stored = row ? readStored(definition, row.credentials) : null;
      const fromEnv = definition.fromEnv();
      const credentials = fromEnv ?? stored;

      return [
        definition.name,
        {
          definition,
          provider: createProvider(definition, credentials),
          source: fromEnv ? "env" : stored ? "dashboard" : null,
          credentials,
          stored: row ? { updatedAt: row.updatedAt, readable: stored !== null } : null,
        },
      ];
    }),
  );
}

function loadGateways(prisma: PrismaClient) {
  if (!cache || cache.expires < Date.now()) {
    const gateways = load(prisma);
    cache = { expires: Date.now() + CACHE_MS, gateways };
    gateways.catch(() => {
      if (cache?.gateways === gateways) cache = null;
    });
  }
  return cache.gateways;
}

export async function getPaymentProvider(prisma: PrismaClient, name: string | null) {
  return name ? ((await loadGateways(prisma)).get(name)?.provider ?? null) : null;
}

/** The gateway new online payments use, or null when online payments are off. */
export function activePaymentProvider(prisma: PrismaClient, settings: { paymentProvider: string | null }) {
  return getPaymentProvider(prisma, settings.paymentProvider);
}

/** Public ids in full; secrets only by their last characters, and not at all when short. */
function summarize(definition: GatewayDefinition, credentials: Credentials | null) {
  return definition.fields.map((field) => {
    const value = credentials?.[field.key] ?? null;
    return {
      key: field.key,
      label: field.label,
      secret: field.secret,
      options: field.options ?? null,
      value: field.secret ? null : value,
      hint: field.secret && value ? (value.length >= 12 ? `ends in ${value.slice(-4)}` : "saved") : null,
    };
  });
}

/** For the admin dashboard. Contains no secret values. */
export async function paymentGatewayOptions(prisma: PrismaClient) {
  const gateways = await loadGateways(prisma);
  return [...gateways.values()].map(({ definition, provider, source, credentials, stored }) => ({
    name: definition.name,
    label: definition.label,
    configured: provider !== null,
    testMode: provider?.testMode ?? null,
    source,
    needsCredentials: definition.fields.length > 0,
    editable: definition.fields.length > 0 && source !== "env" && canStoreSecrets,
    fields: summarize(definition, credentials),
    savedKeysUnreadable: stored !== null && !stored.readable,
    webhookUrl:
      definition.webhookEvents && env.PUBLIC_API_URL
        ? `${env.PUBLIC_API_URL.replace(/\/+$/, "")}/payments/webhooks/${definition.name}`
        : null,
    webhookEvents: definition.webhookEvents,
    keysUpdatedAt: source === "dashboard" ? (stored?.updatedAt ?? null) : null,
  }));
}

function editableGateway(name: string) {
  const definition = GATEWAYS.find((gateway) => gateway.name === name);
  if (!definition || definition.fields.length === 0) {
    throw new AppError(404, "PAYMENT_GATEWAY_NOT_FOUND", "Unknown payment gateway");
  }
  if (definition.fromEnv()) {
    throw new AppError(409, "PAYMENT_GATEWAY_SET_IN_ENVIRONMENT", `${definition.label} keys are set in the server environment. Change them there.`);
  }
  return definition;
}

/**
 * Saves keys entered by an admin after the gateway accepts them. Blank secret fields keep the saved
 * value, so an admin can change one key without retyping the others.
 */
export async function saveGatewayCredentials(
  prisma: PrismaClient,
  name: string,
  input: Record<string, string>,
  adminId: string,
) {
  const definition = editableGateway(name);
  if (!canStoreSecrets) {
    throw new AppError(409, "PAYMENT_SECRETS_KEY_MISSING", "Set PAYMENT_SECRETS_KEY on the server to save gateway keys here");
  }

  const saved = (await loadGateways(prisma)).get(name)?.credentials ?? null;
  const merged = Object.fromEntries(
    definition.fields.map((field) => {
      const value = input[field.key]?.trim() ?? "";
      return [field.key, field.secret && !value ? (saved?.[field.key] ?? "") : value];
    }),
  );
  const credentials = definition.parse(merged);

  if (!(await definition.create(credentials).checkCredentials())) {
    throw new AppError(400, "PAYMENT_GATEWAY_KEYS_REJECTED", `${definition.label} rejected these keys. Check them and try again.`);
  }

  const data = { credentials: sealSecret(JSON.stringify(credentials), name), updatedById: adminId };
  await prisma.paymentGatewayCredential.upsert({ where: { gateway: name }, create: { gateway: name, ...data }, update: data });
  cache = null;
}

export async function removeGatewayCredentials(prisma: PrismaClient, name: string, activeGateway: string | null) {
  const definition = editableGateway(name);
  if (activeGateway === name) {
    throw new AppError(409, "PAYMENT_GATEWAY_ACTIVE", `Choose another gateway before removing the ${definition.label} keys`);
  }
  await prisma.paymentGatewayCredential.deleteMany({ where: { gateway: name } });
  cache = null;
}
