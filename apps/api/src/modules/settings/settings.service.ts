import { env } from "../../config/env.js";
import { PaymentMethod, Prisma, UserRole, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { canStoreSecrets } from "../../shared/secret-box.js";
import { hashOtp } from "../auth/otp-provider.js";
import type { OtpRegistry } from "../auth/otp-registry.js";
import {
  activePaymentProvider,
  getPaymentProvider,
  paymentGatewayOptions,
  removeGatewayCredentials,
  saveGatewayCredentials,
} from "../payments/gateway-registry.js";
import {
  getShippingProvider,
  removeCarrierCredentials,
  saveCarrierCredentials,
  shippingCarrierOptions,
} from "../shipping/carrier-registry.js";
import { MANUAL_CARRIER } from "../shipping/shipping-provider.js";
import { getAppearance } from "./appearance.service.js";
import { POLICY_SLUGS, type PolicySlug } from "./policy-templates.js";
import type { ReviewLoginInput, UpdateSettingsInput } from "./settings.schemas.js";

type Db = PrismaClient | Prisma.TransactionClient;

const SETTINGS_ID = "platform";

/** Returns the settings row, creating it from the environment defaults on first use. */
export async function getPlatformSettings(db: Db) {
  const existing = await db.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) {
    return existing;
  }

  return db.platformSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: {
      id: SETTINGS_ID,
      shippingFee: env.SHIPPING_FEE,
      freeShippingThreshold: env.FREE_SHIPPING_THRESHOLD,
      codFee: env.COD_FEE,
      minOrderValue: env.MIN_ORDER_VALUE,
    },
  });
}

export type PlatformSettings = Awaited<ReturnType<typeof getPlatformSettings>>;

/** One weight band: orders up to maxWeightGrams pay fee. */
type WeightSlab = { maxWeightGrams: number; fee: string };

/** The saved weight slabs, cheapest-to-heaviest, ignoring malformed entries. */
export function weightSlabs(settings: PlatformSettings): WeightSlab[] {
  if (!Array.isArray(settings.weightSlabs)) return [];
  return (settings.weightSlabs as unknown[])
    .flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const { maxWeightGrams, fee } = entry as { maxWeightGrams?: unknown; fee?: unknown };
      if (typeof maxWeightGrams !== "number" || !Number.isInteger(maxWeightGrams) || maxWeightGrams <= 0 || typeof fee !== "string") {
        return [];
      }
      try {
        const amount = new Prisma.Decimal(fee);
        if (!amount.isFinite() || amount.lt(0)) return [];
        return [{ maxWeightGrams, fee: amount.toFixed(2) }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => a.maxWeightGrams - b.maxWeightGrams);
}

/**
 * The shipping fee for an order: free once the subtotal reaches the free-shipping threshold, otherwise
 * the fee of the first weight slab the order fits (the last slab's fee above it), or the flat fee when
 * no slabs are set. The weight is the sum of the ordered lines.
 */
export function shippingFeeFor(settings: PlatformSettings, subtotal: Prisma.Decimal, weightGrams: number) {
  if (settings.freeShippingThreshold !== null && subtotal.gte(settings.freeShippingThreshold)) {
    return new Prisma.Decimal(0);
  }
  const slabs = weightSlabs(settings);
  if (slabs.length > 0) {
    const slab = slabs.find((entry) => weightGrams <= entry.maxWeightGrams) ?? slabs[slabs.length - 1]!;
    return new Prisma.Decimal(slab.fee);
  }
  return settings.shippingFee;
}

/**
 * Shipping fee, COD fee and totals for a subtotal and coupon discount. Used for the cart preview and at
 * checkout so they always agree. The minimum order and free shipping use the subtotal before the discount.
 * `total` is what a prepaid order pays; `totalWithCod` adds the COD fee for a cash-on-delivery order.
 */
export function calculateCharges(
  subtotal: Prisma.Decimal,
  settings: PlatformSettings,
  { discount = new Prisma.Decimal(0), weightGrams = 0 }: { discount?: Prisma.Decimal; weightGrams?: number } = {},
) {
  const shippingFee = shippingFeeFor(settings, subtotal, weightGrams);
  const total = subtotal.add(shippingFee).sub(discount);

  return {
    subtotal,
    shippingFee,
    codFee: settings.codFee,
    discount,
    total,
    totalWithCod: total.add(settings.codFee),
    minOrderValue: settings.minOrderValue,
    meetsMinimum: subtotal.gte(settings.minOrderValue),
    amountToFreeShipping:
      settings.freeShippingThreshold === null || shippingFee.eq(0) ? null : settings.freeShippingThreshold.sub(subtotal),
  };
}

/** Links to the public website and its policy pages; null when PUBLIC_SITE_URL is not set. */
function policyLinks() {
  if (!env.PUBLIC_SITE_URL) {
    return null;
  }
  const base = env.PUBLIC_SITE_URL.replace(/\/+$/, "");
  return {
    home: base,
    index: `${base}/policies`,
    ...Object.fromEntries([...POLICY_SLUGS, "contact"].map((slug) => [slug, `${base}/${slug}`])),
  } as Record<"home" | "index" | PolicySlug | "contact", string>;
}

/**
 * The customer account reviewers sign in to, so staff can tell its orders apart. Not on a demo, where the
 * review number is a test account and every order comes from it.
 */
export async function reviewAccountUserId(db: Db) {
  const { reviewLoginPhone } = await getPlatformSettings(db);
  if (!reviewLoginPhone) {
    return null;
  }
  const user = await db.user.findUnique({ where: { phone: reviewLoginPhone }, select: { id: true, isTestAccount: true } });
  return user && !user.isTestAccount ? user.id : null;
}

async function toAdminView(prisma: PrismaClient, otp: OtpRegistry, settings: PlatformSettings) {
  return {
    shippingFee: settings.shippingFee.toFixed(2),
    freeShippingThreshold: settings.freeShippingThreshold?.toFixed(2) ?? null,
    codFee: settings.codFee.toFixed(2),
    weightSlabs: weightSlabs(settings),
    minOrderValue: settings.minOrderValue.toFixed(2),
    codMaxOrderValue: settings.codMaxOrderValue?.toFixed(2) ?? null,
    deliveryPromiseMinutes: settings.deliveryPromiseMinutes,
    supportPhone: settings.supportPhone,
    supportEmail: settings.supportEmail,
    businessName: settings.businessName,
    businessAddress: settings.businessAddress,
    gstin: settings.gstin,
    shippingFeeGstRate: settings.shippingFeeGstRate.toFixed(2),
    websiteTagline: settings.websiteTagline,
    playStoreUrl: settings.playStoreUrl,
    appStoreUrl: settings.appStoreUrl,
    appDownloadUrl: settings.appDownloadUrl,
    reviewLogin: {
      enabled: settings.reviewLoginEnabled,
      phone: settings.reviewLoginPhone,
      codeSet: settings.reviewLoginCodeHash !== null,
    },
    paymentProvider: settings.paymentProvider,
    paymentGateways: await paymentGatewayOptions(prisma),
    shippingProvider: settings.shippingProvider ?? MANUAL_CARRIER,
    shippingCarriers: await shippingCarrierOptions(prisma),
    canStoreSecrets,
    sms: await otp.adminView(),
    updatedById: settings.updatedById,
    updatedAt: settings.updatedAt,
  };
}

export function createSettingsService(prisma: PrismaClient, otp: OtpRegistry) {
  async function getPublicSettings() {
    const [settings, { appearance }] = await Promise.all([getPlatformSettings(prisma), getAppearance(prisma)]);

    return {
      appName: appearance.appName,
      branding: {
        logoUrl: appearance.logoUrl,
        primaryColor: appearance.theme.colors.primary,
        secondaryColor: appearance.theme.colors.accent,
      },
      theme: appearance.theme,
      announcement: appearance.announcement,
      currency: env.CURRENCY,
      timezone: env.TIMEZONE,
      pricing: {
        shippingFee: settings.shippingFee.toFixed(2),
        freeShippingThreshold: settings.freeShippingThreshold?.toFixed(2) ?? null,
        codFee: settings.codFee.toFixed(2),
        minOrderValue: settings.minOrderValue.toFixed(2),
      },
      deliveryPromiseMinutes: settings.deliveryPromiseMinutes,
      payments: {
        methods: (await activePaymentProvider(prisma, settings)) ? [PaymentMethod.COD, PaymentMethod.ONLINE] : [PaymentMethod.COD],
        onlinePaymentTimeoutMinutes: env.PAYMENT_TIMEOUT_MINUTES,
      },
      support: {
        phone: settings.supportPhone,
        email: settings.supportEmail,
      },
      policies: policyLinks(),
      demoLogins: env.DEMO_LOGINS ?? null,
    };
  }

  async function getAdminSettings() {
    return toAdminView(prisma, otp, await getPlatformSettings(prisma));
  }

  async function updateSettings(input: UpdateSettingsInput, adminId: string) {
    if (input.paymentProvider && !(await getPaymentProvider(prisma, input.paymentProvider))) {
      throw new AppError(400, "PAYMENT_GATEWAY_NOT_CONFIGURED", "This payment gateway is not configured on the server", {
        paymentProvider: input.paymentProvider,
      });
    }
    if (input.otpProvider !== undefined) {
      await otp.assertSelectable(input.otpProvider);
    }
    if (input.shippingProvider && !(await getShippingProvider(prisma, input.shippingProvider))) {
      throw new AppError(400, "SHIPPING_CARRIER_NOT_CONFIGURED", "This shipping carrier is not configured on the server", {
        shippingProvider: input.shippingProvider,
      });
    }
    // Manual is what no selection means. A null weightSlabs clears the slabs (SQL NULL, not JSON null).
    const { weightSlabs, ...inputData } = input;
    const data = {
      ...inputData,
      ...(input.shippingProvider === MANUAL_CARRIER && { shippingProvider: null }),
      ...(weightSlabs !== undefined && { weightSlabs: weightSlabs === null ? Prisma.DbNull : weightSlabs }),
    };

    await getPlatformSettings(prisma);
    const updated = await prisma.platformSettings.update({
      where: { id: SETTINGS_ID },
      data: { ...data, updatedById: adminId },
    });
    otp.invalidate();
    return toAdminView(prisma, otp, updated);
  }

  async function saveOtpProviderKeys(provider: string, credentials: Record<string, string>, adminId: string) {
    await otp.saveCredentials(provider, credentials, adminId);
    return getAdminSettings();
  }

  async function removeOtpProviderKeys(provider: string) {
    await otp.removeCredentials(provider);
    return getAdminSettings();
  }

  async function saveGatewayKeys(gateway: string, credentials: Record<string, string>, adminId: string) {
    await saveGatewayCredentials(prisma, gateway, credentials, adminId);
    return getAdminSettings();
  }

  async function removeGatewayKeys(gateway: string) {
    const settings = await getPlatformSettings(prisma);
    await removeGatewayCredentials(prisma, gateway, settings.paymentProvider);
    return getAdminSettings();
  }

  async function saveCarrierKeys(carrier: string, credentials: Record<string, string>, adminId: string) {
    await saveCarrierCredentials(prisma, carrier, credentials, adminId);
    return getAdminSettings();
  }

  async function removeCarrierKeys(carrier: string) {
    const settings = await getPlatformSettings(prisma);
    await removeCarrierCredentials(prisma, carrier, settings.shippingProvider);
    return getAdminSettings();
  }

  /**
   * The review login: a customer or new number. A blank code keeps the saved one, which only works
   * for the same phone number.
   */
  async function saveReviewLogin(input: ReviewLoginInput, adminId: string) {
    const settings = await getPlatformSettings(prisma);
    const { enabled, phone, code } = input;
    const saved = { phone: settings.reviewLoginPhone, codeHash: settings.reviewLoginCodeHash };

    if (phone) {
      const owner = await prisma.user.findUnique({ where: { phone }, select: { role: true } });
      if (owner && owner.role !== UserRole.CUSTOMER) {
        throw new AppError(400, "REVIEW_PHONE_NOT_CUSTOMER", "This number belongs to an admin or staff. Use a number only reviewers will use.", {
          field: "phone",
        });
      }
    }
    const keepsCode = !code && phone === saved.phone && saved.codeHash !== null;
    if (enabled && !code && !keepsCode) {
      throw new AppError(400, "REVIEW_CODE_REQUIRED", "Enter the code reviewers will type", { field: "code" });
    }

    const codeHash = phone && code ? hashOtp(phone, code) : keepsCode ? saved.codeHash : null;
    const updated = await prisma.platformSettings.update({
      where: { id: SETTINGS_ID },
      data: { reviewLoginEnabled: enabled, reviewLoginPhone: phone, reviewLoginCodeHash: codeHash, updatedById: adminId },
    });
    otp.invalidate();
    return toAdminView(prisma, otp, updated);
  }

  return {
    getPublicSettings,
    getAdminSettings,
    updateSettings,
    saveReviewLogin,
    saveGatewayKeys,
    removeGatewayKeys,
    saveCarrierKeys,
    removeCarrierKeys,
    saveOtpProviderKeys,
    removeOtpProviderKeys,
  };
}
