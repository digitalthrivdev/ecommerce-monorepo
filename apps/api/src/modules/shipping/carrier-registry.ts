import { env } from "../../config/env.js";
import type { PrismaClient } from "../../generated/prisma/client";
import { mergeCredentials, summarizeCredentials, type Credentials } from "../../shared/credentials.js";
import { AppError } from "../../shared/errors.js";
import { canStoreSecrets, openSecret, sealSecret } from "../../shared/secret-box.js";
import { CARRIERS, MANUAL_CARRIER, type CarrierDefinition, type ShippingProvider } from "./shipping-provider.js";

/**
 * The carriers this deployment can use: credentials from the server environment take priority,
 * otherwise keys an admin saved in the dashboard. Cached like the payment gateways (see
 * payments/gateway-registry.ts).
 */
const CACHE_MS = 30_000;

type LoadedCarrier = {
  definition: CarrierDefinition;
  provider: ShippingProvider | null;
  source: "env" | "dashboard" | null;
  credentials: Credentials | null;
  stored: { updatedAt: Date; readable: boolean } | null;
};

let cache: { expires: number; carriers: Promise<Map<string, LoadedCarrier>> } | null = null;

function readStored(definition: CarrierDefinition, sealed: string) {
  const plaintext = openSecret(sealed, `shipping:${definition.name}`);
  if (!plaintext) return null;
  try {
    return definition.parse(JSON.parse(plaintext) as Record<string, string>);
  } catch {
    return null;
  }
}

function createProvider(definition: CarrierDefinition, credentials: Credentials | null) {
  if (!credentials) return null;
  try {
    return definition.create(credentials);
  } catch {
    return null;
  }
}

async function load(prisma: PrismaClient) {
  const rows = new Map((await prisma.shippingCarrierCredential.findMany()).map((row) => [row.carrier, row]));

  const map = new Map<string, LoadedCarrier>();
  for (const definition of CARRIERS) {
    const row = rows.get(definition.name);
    const stored = row ? readStored(definition, row.credentials) : null;
    const fromEnv = definition.fromEnv();
    const credentials = fromEnv ?? stored;
    const loaded: LoadedCarrier = {
      definition,
      provider: createProvider(definition, credentials),
      source: fromEnv ? "env" : stored ? "dashboard" : null,
      credentials,
      stored: row ? { updatedAt: row.updatedAt, readable: stored !== null } : null,
    };
    map.set(definition.name, loaded);
    if (definition.webhookSlug) {
      map.set(definition.webhookSlug, loaded);
    }
    for (const alias of definition.webhookAliases ?? []) {
      map.set(alias, loaded);
    }
  }
  return map;
}

function loadCarriers(prisma: PrismaClient) {
  if (!cache || cache.expires < Date.now()) {
    const carriers = load(prisma);
    cache = { expires: Date.now() + CACHE_MS, carriers };
    carriers.catch(() => {
      if (cache?.carriers === carriers) cache = null;
    });
  }
  return cache.carriers;
}

export async function getShippingProvider(prisma: PrismaClient, name: string) {
  return (await loadCarriers(prisma)).get(name)?.provider ?? null;
}

/** The carrier new shipments are booked with; manual when none is selected or its keys stopped working. */
export async function activeShippingProvider(prisma: PrismaClient, settings: { shippingProvider: string | null }) {
  const provider = settings.shippingProvider ? await getShippingProvider(prisma, settings.shippingProvider) : null;
  return provider ?? (await getShippingProvider(prisma, MANUAL_CARRIER))!;
}

/** For the admin dashboard. Contains no secret values. */
export async function shippingCarrierOptions(prisma: PrismaClient) {
  const carriers = await loadCarriers(prisma);
  return CARRIERS.map((definition) => {
    const loaded = carriers.get(definition.name)!;
    return {
      name: definition.name,
      label: definition.label,
      configured: loaded.provider !== null,
      testMode: loaded.provider?.testMode ?? null,
      source: loaded.source,
      needsCredentials: definition.fields.length > 0,
      editable: definition.fields.length > 0 && loaded.source !== "env" && canStoreSecrets,
      fields: summarizeCredentials(definition.fields, loaded.credentials),
      savedKeysUnreadable: loaded.stored !== null && !loaded.stored.readable,
      webhookUrl:
        definition.webhookEvents && env.PUBLIC_API_URL
          ? `${env.PUBLIC_API_URL.replace(/\/+$/, "")}/shipping/webhooks/${definition.webhookSlug ?? definition.name}`
          : null,
      webhookEvents: definition.webhookEvents,
      keysUpdatedAt: loaded.source === "dashboard" ? (loaded.stored?.updatedAt ?? null) : null,
    };
  });
}

function editableCarrier(name: string) {
  const definition = CARRIERS.find((carrier) => carrier.name === name);
  if (!definition || definition.fields.length === 0) {
    throw new AppError(404, "SHIPPING_CARRIER_NOT_FOUND", "Unknown shipping carrier");
  }
  if (definition.fromEnv()) {
    throw new AppError(409, "SHIPPING_CARRIER_SET_IN_ENVIRONMENT", `${definition.label} keys are set in the server environment. Change them there.`);
  }
  return definition;
}

/** Saves keys entered by an admin after the carrier accepts them. Blank secret fields keep the saved value. */
export async function saveCarrierCredentials(prisma: PrismaClient, name: string, input: Record<string, string>, adminId: string) {
  const definition = editableCarrier(name);
  if (!canStoreSecrets) {
    throw new AppError(409, "SECRETS_ENCRYPTION_KEY_MISSING", "Set SECRETS_ENCRYPTION_KEY on the server to save carrier keys here");
  }

  const saved = (await loadCarriers(prisma)).get(name)?.credentials ?? null;
  const credentials = definition.parse(mergeCredentials(definition.fields, input, saved));

  if (!(await definition.create(credentials).checkCredentials())) {
    throw new AppError(400, "SHIPPING_CARRIER_KEYS_REJECTED", `${definition.label} rejected these keys. Check them and try again.`);
  }

  const data = { credentials: sealSecret(JSON.stringify(credentials), `shipping:${name}`), updatedById: adminId };
  await prisma.shippingCarrierCredential.upsert({ where: { carrier: name }, create: { carrier: name, ...data }, update: data });
  cache = null;
}

export async function removeCarrierCredentials(prisma: PrismaClient, name: string, activeCarrier: string | null) {
  const definition = editableCarrier(name);
  if (activeCarrier === name) {
    throw new AppError(409, "SHIPPING_CARRIER_ACTIVE", `Choose another carrier before removing the ${definition.label} keys`);
  }
  await prisma.shippingCarrierCredential.deleteMany({ where: { carrier: name } });
  cache = null;
}
