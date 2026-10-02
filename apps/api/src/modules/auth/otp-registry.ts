import { env } from "../../config/env.js";
import { UserRole, type PrismaClient } from "../../generated/prisma/client";
import { mergeCredentials, summarizeCredentials, type Credentials } from "../../shared/credentials.js";
import { AppError } from "../../shared/errors.js";
import { canStoreSecrets, openSecret, sealSecret } from "../../shared/secret-box.js";
import { getPlatformSettings } from "../settings/settings.service.js";
import {
  createLogProvider,
  OTP_PROVIDERS,
  type OtpProvider,
  type OtpProviderDefinition,
  type OtpProviderDeps,
} from "./otp-provider.js";

/** Cached briefly; a change clears the cache on this instance, other instances pick it up within CACHE_MS. */
const CACHE_MS = 30_000;

type LoadedProvider = {
  definition: OtpProviderDefinition;
  provider: OtpProvider | null;
  source: "env" | "dashboard" | null;
  /** Never leaves this module except to merge an admin's edit. */
  credentials: Credentials | null;
  stored: { updatedAt: Date; readable: boolean } | null;
};

type Loaded = { providers: Map<string, LoadedProvider>; selected: string | null };

const sealContext = (name: string) => `otp:${name}`;

function readStored(definition: OtpProviderDefinition, sealed: string) {
  const plaintext = openSecret(sealed, sealContext(definition.name));
  if (!plaintext) return null;
  try {
    return definition.parse(JSON.parse(plaintext) as Record<string, string>);
  } catch {
    return null;
  }
}

/**
 * Which SMS provider sends login OTPs: OTP_PROVIDER in the environment if set, otherwise the one an
 * admin chose in the dashboard. Keys come from the environment first, then from the dashboard.
 * Until a provider is set up, codes are written to the API log: for everyone in development, and in
 * production only for existing admins, so the first admin can sign in and set one up.
 */
export function createOtpRegistry({ prisma, ...deps }: OtpProviderDeps & { prisma: PrismaClient }) {
  const logProvider = createLogProvider(deps.log);
  let cache: { expires: number; loaded: Promise<Loaded> } | null = null;

  function createProvider(definition: OtpProviderDefinition, credentials: Credentials | null) {
    if (!credentials) return null;
    try {
      return definition.create(credentials, deps);
    } catch {
      return null;
    }
  }

  async function load(): Promise<Loaded> {
    const [rows, settings] = await Promise.all([prisma.otpProviderCredential.findMany(), getPlatformSettings(prisma)]);
    const byName = new Map(rows.map((row) => [row.provider, row]));

    const providers = new Map(
      OTP_PROVIDERS.map((definition): [string, LoadedProvider] => {
        const row = byName.get(definition.name);
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
    return { providers, selected: settings.otpProvider };
  }

  function loaded() {
    if (!cache || cache.expires < Date.now()) {
      const promise = load();
      cache = { expires: Date.now() + CACHE_MS, loaded: promise };
      promise.catch(() => {
        if (cache?.loaded === promise) cache = null;
      });
    }
    return cache.loaded;
  }

  function invalidate() {
    cache = null;
  }

  /** The provider sending new OTPs, or null when none is set up. */
  async function active() {
    if (env.OTP_PROVIDER === "log") return logProvider;
    const { providers, selected } = await loaded();
    const name = env.OTP_PROVIDER ?? selected;
    return name ? (providers.get(name)?.provider ?? null) : null;
  }

  async function forPhone(phone: string) {
    const provider = await active();
    if (provider) return provider;
    if (env.NODE_ENV !== "production") return logProvider;

    const user = await prisma.user.findUnique({ where: { phone }, select: { role: true } });
    if (user?.role === UserRole.ADMIN) {
      deps.log.warn("No SMS provider is set up; writing an admin's login OTP to the log");
      return logProvider;
    }
    throw new AppError(503, "OTP_NOT_CONFIGURED", "Sign-in by SMS is not available yet. Please try again later.");
  }

  /** The provider that sent a pending OTP, so it can still be checked after a switch. */
  async function byName(name: string) {
    if (name === logProvider.name) return logProvider;
    return (await loaded()).providers.get(name)?.provider ?? null;
  }

  /** For the admin dashboard. Contains no secret values. */
  async function adminView() {
    const { providers, selected } = await loaded();
    const activeProvider = await active();
    return {
      selected,
      active: activeProvider?.name ?? null,
      /** Set when OTP_PROVIDER in the environment overrides the dashboard choice. */
      environmentOverride: env.OTP_PROVIDER ?? null,
      /** Who can sign in while no provider is set up. */
      fallback: env.NODE_ENV === "production" ? ("admins" as const) : ("everyone" as const),
      providers: [...providers.values()].map(({ definition, provider, source, credentials, stored }) => ({
        name: definition.name,
        label: definition.label,
        configured: provider !== null,
        source,
        editable: source !== "env" && canStoreSecrets,
        fields: summarizeCredentials(definition.fields, credentials),
        savedKeysUnreadable: stored !== null && !stored.readable,
        keysUpdatedAt: source === "dashboard" ? (stored?.updatedAt ?? null) : null,
      })),
    };
  }

  /** Throws unless `name` can be selected in the dashboard (null turns SMS off). */
  async function assertSelectable(name: string | null) {
    if (env.OTP_PROVIDER) {
      throw new AppError(409, "OTP_PROVIDER_SET_IN_ENVIRONMENT", "The SMS provider is set by OTP_PROVIDER in the server environment. Change it there.");
    }
    if (name && !(await loaded()).providers.get(name)?.provider) {
      throw new AppError(400, "OTP_PROVIDER_NOT_CONFIGURED", "Add this SMS provider's keys first", { otpProvider: name });
    }
  }

  function editable(name: string) {
    const definition = OTP_PROVIDERS.find((provider) => provider.name === name);
    if (!definition) {
      throw new AppError(404, "OTP_PROVIDER_NOT_FOUND", "Unknown SMS provider");
    }
    if (definition.fromEnv()) {
      throw new AppError(409, "OTP_PROVIDER_SET_IN_ENVIRONMENT", `${definition.label} keys are set in the server environment. Change them there.`);
    }
    return definition;
  }

  /** Saves keys entered by an admin after the provider accepts them. Blank secret fields keep the saved value. */
  async function saveCredentials(name: string, input: Record<string, string>, adminId: string) {
    const definition = editable(name);
    if (!canStoreSecrets) {
      throw new AppError(409, "SECRETS_ENCRYPTION_KEY_MISSING", "Set SECRETS_ENCRYPTION_KEY on the server to save SMS provider keys here");
    }

    const saved = (await loaded()).providers.get(name)?.credentials ?? null;
    const credentials = definition.parse(mergeCredentials(definition.fields, input, saved));
    if (!(await definition.create(credentials, deps).checkCredentials())) {
      throw new AppError(400, "OTP_PROVIDER_KEYS_REJECTED", `${definition.label} rejected these details. Check them and try again.`);
    }

    const data = { credentials: sealSecret(JSON.stringify(credentials), sealContext(name)), updatedById: adminId };
    await prisma.otpProviderCredential.upsert({ where: { provider: name }, create: { provider: name, ...data }, update: data });
    invalidate();
  }

  async function removeCredentials(name: string) {
    const definition = editable(name);
    if ((await loaded()).selected === name) {
      throw new AppError(409, "OTP_PROVIDER_ACTIVE", `Choose another SMS provider before removing the ${definition.label} keys`);
    }
    await prisma.otpProviderCredential.deleteMany({ where: { provider: name } });
    invalidate();
  }

  return { forPhone, byName, adminView, assertSelectable, saveCredentials, removeCredentials, invalidate };
}

export type OtpRegistry = ReturnType<typeof createOtpRegistry>;
