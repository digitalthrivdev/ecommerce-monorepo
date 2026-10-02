import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import type { FastifyBaseLogger } from "fastify";
import type Redis from "ioredis";
import { z } from "zod";

import { env } from "../../config/env.js";
import type { CredentialField, Credentials } from "../../shared/credentials.js";
import { createMessageCentralProvider } from "./message-central-provider.js";

export type OtpCheck = "valid" | "invalid" | "expired" | "too-many-attempts";

/**
 * Delivers and checks login OTPs. Some providers send a code we generate; others (verification
 * services such as Message Central VerifyNow) generate and check the code themselves. Either way
 * `start` returns an opaque reference the auth service keeps in Redis until the OTP is verified.
 * Rate limits, cooldowns and attempt limits stay in the auth service, in front of every provider.
 */
export interface OtpProvider {
  readonly name: string;
  start(phone: string): Promise<{ reference: string }>;
  check(input: { phone: string; code: string; reference: string }): Promise<OtpCheck>;
  /** False when the provider rejects the credentials. Used before saving keys entered by an admin. */
  checkCredentials(): Promise<boolean>;
}

export const OTP_LENGTH = 6;

export type OtpProviderDeps = { log: FastifyBaseLogger; redis: Redis };

function hashOtp(phone: string, otp: string) {
  return createHmac("sha256", env.JWT_SECRET).update(`${phone}:${otp}`).digest("hex");
}

/**
 * Generates the code and writes it to the API log instead of sending an SMS. Used in development,
 * and in production only to let admins sign in before an SMS provider is set up.
 */
export function createLogProvider(log: FastifyBaseLogger): OtpProvider {
  return {
    name: "log",
    async start(phone) {
      const otp = randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
      log.info({ phone, otp }, "Login OTP (not sent via SMS)");
      return { reference: hashOtp(phone, otp) };
    },
    async check({ phone, code, reference }) {
      const expected = Buffer.from(reference, "hex");
      const actual = Buffer.from(hashOtp(phone, code), "hex");
      return expected.length === actual.length && timingSafeEqual(expected, actual) ? "valid" : "invalid";
    },
    async checkCredentials() {
      return true;
    },
  };
}

export type OtpProviderDefinition = {
  name: string;
  label: string;
  fields: readonly CredentialField[];
  /** Credentials from the server environment, or null when they are not set there. */
  fromEnv(): Credentials | null;
  /** Validates credentials; throws a ZodError naming the bad fields. */
  parse(input: Record<string, string | undefined>): Credentials;
  create(credentials: Credentials, deps: OtpProviderDeps): OtpProvider;
};

function defineOtpProvider<S extends z.ZodObject<Record<string, z.ZodType<string>>>>(definition: {
  name: string;
  label: string;
  fields: readonly CredentialField[];
  schema: S;
  fromEnv(): z.infer<S> | null;
  create(credentials: z.infer<S>, deps: OtpProviderDeps): OtpProvider;
}): OtpProviderDefinition {
  const { schema, create, ...rest } = definition;
  return {
    ...rest,
    parse: (input) => schema.parse(input),
    create: (credentials, deps) => create(schema.parse(credentials), deps),
  };
}

const required = z.string().trim().min(1, "Required");

/** Every SMS provider the platform supports. Add one by implementing OtpProvider and listing it here. */
export const OTP_PROVIDERS: readonly OtpProviderDefinition[] = [
  defineOtpProvider({
    name: "message-central",
    label: "Message Central",
    fields: [
      { key: "customerId", label: "Customer ID", secret: false, help: "Shown in the Message Central console." },
      { key: "password", label: "Password", secret: true, help: "Your Message Central account password." },
      { key: "countryCode", label: "Country code", secret: false, help: "Only phone numbers with this code can sign in.", default: "91" },
      { key: "email", label: "Account email", secret: false, optional: true },
    ],
    schema: z.object({
      customerId: required.max(64).regex(/^[A-Za-z0-9-]+$/, "Letters, digits and hyphens only"),
      password: required.max(256),
      countryCode: required.regex(/^[1-9]\d{0,3}$/, "Digits only, e.g. 91"),
      email: z.union([z.literal(""), z.email("Enter a valid email").max(200)]),
    }),
    fromEnv: () =>
      env.MESSAGE_CENTRAL_CUSTOMER_ID && env.MESSAGE_CENTRAL_KEY
        ? {
            customerId: env.MESSAGE_CENTRAL_CUSTOMER_ID,
            password: Buffer.from(env.MESSAGE_CENTRAL_KEY, "base64").toString("utf8"),
            countryCode: env.MESSAGE_CENTRAL_COUNTRY_CODE,
            email: env.MESSAGE_CENTRAL_EMAIL ?? "",
          }
        : null,
    create: (credentials, deps) =>
      createMessageCentralProvider({
        customerId: credentials.customerId,
        key: Buffer.from(credentials.password, "utf8").toString("base64"),
        countryCode: credentials.countryCode,
        email: credentials.email || undefined,
        ...deps,
      }),
  }),
];
