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
      deliveryFee: env.DELIVERY_FEE,
      freeDeliveryThreshold: env.FREE_DELIVERY_THRESHOLD,
      minOrderValue: env.MIN_ORDER_VALUE,
      deliveryPartnerFee: env.DELIVERY_PARTNER_FEE,
    },
  });
}

export type PlatformSettings = Awaited<ReturnType<typeof getPlatformSettings>>;

/**
 * Delivery fee and totals for a subtotal and coupon discount. Used for the cart preview and at
 * checkout so they always agree. The minimum order and free delivery use the subtotal before the discount.
 */
export function calculateCharges(subtotal: Prisma.Decimal, settings: PlatformSettings, discount = new Prisma.Decimal(0)) {
  const freeDelivery =
    settings.freeDeliveryThreshold !== null && subtotal.gte(settings.freeDeliveryThreshold);
  const deliveryFee = freeDelivery ? new Prisma.Decimal(0) : settings.deliveryFee;

  return {
    subtotal,
    deliveryFee,
    discount,
    total: subtotal.add(deliveryFee).sub(discount),
    minOrderValue: settings.minOrderValue,
    meetsMinimum: subtotal.gte(settings.minOrderValue),
    amountToFreeDelivery:
      settings.freeDeliveryThreshold === null || freeDelivery
        ? null
        : settings.freeDeliveryThreshold.sub(subtotal),
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
    deliveryFee: settings.deliveryFee.toFixed(2),
    freeDeliveryThreshold: settings.freeDeliveryThreshold?.toFixed(2) ?? null,
    minOrderValue: settings.minOrderValue.toFixed(2),
    deliveryPartnerFee: settings.deliveryPartnerFee.toFixed(2),
    riderCashLimit: settings.riderCashLimit?.toFixed(2) ?? null,
    codMaxOrderValue: settings.codMaxOrderValue?.toFixed(2) ?? null,
    deliveryPromiseMinutes: settings.deliveryPromiseMinutes,
    supportPhone: settings.supportPhone,
    supportEmail: settings.supportEmail,
    businessName: settings.businessName,
    businessAddress: settings.businessAddress,
    gstin: settings.gstin,
    deliveryFeeGstRate: settings.deliveryFeeGstRate.toFixed(2),
    websiteTagline: settings.websiteTagline,
    playStoreUrl: settings.playStoreUrl,
    appStoreUrl: settings.appStoreUrl,
    appDownloadUrl: settings.appDownloadUrl,
    deliveryPlayStoreUrl: settings.deliveryPlayStoreUrl,
    deliveryAppStoreUrl: settings.deliveryAppStoreUrl,
    deliveryDownloadUrl: settings.deliveryDownloadUrl,
    reviewLogin: {
      enabled: settings.reviewLoginEnabled,
      phone: settings.reviewLoginPhone,
      codeSet: settings.reviewLoginCodeHash !== null,
    },
    riderReviewLogin: {
      enabled: settings.riderReviewLoginEnabled,
      phone: settings.riderReviewLoginPhone,
      codeSet: settings.riderReviewLoginCodeHash !== null,
    },
    paymentProvider: settings.paymentProvider,
    paymentGateways: await paymentGatewayOptions(prisma),
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
        deliveryFee: settings.deliveryFee.toFixed(2),
        freeDeliveryThreshold: settings.freeDeliveryThreshold?.toFixed(2) ?? null,
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

    await getPlatformSettings(prisma);
    const updated = await prisma.platformSettings.update({
      where: { id: SETTINGS_ID },
      data: { ...input, updatedById: adminId },
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

  /**
   * The review login of the customer app (a customer or new number) or the delivery app (an existing
   * rider's number). A blank code keeps the saved one, which only works for the same phone number.
   */
  async function saveReviewLogin(app: "customer" | "rider", input: ReviewLoginInput, adminId: string) {
    const settings = await getPlatformSettings(prisma);
    const { enabled, phone, code } = input;
    const saved =
      app === "customer"
        ? { phone: settings.reviewLoginPhone, codeHash: settings.reviewLoginCodeHash }
        : { phone: settings.riderReviewLoginPhone, codeHash: settings.riderReviewLoginCodeHash };

    if (phone) {
      const owner = await prisma.user.findUnique({ where: { phone }, select: { role: true } });
      if (app === "customer" && owner && owner.role !== UserRole.CUSTOMER) {
        throw new AppError(400, "REVIEW_PHONE_NOT_CUSTOMER", "This number belongs to an admin, store staff or rider. Use a number only reviewers will use.", {
          field: "phone",
        });
      }
      if (app === "rider" && owner?.role !== UserRole.DELIVERY_PARTNER) {
        throw new AppError(400, "REVIEW_PHONE_NOT_RIDER", "Add this number as a delivery partner first, then use it here.", {
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
      data: {
        ...(app === "customer"
          ? { reviewLoginEnabled: enabled, reviewLoginPhone: phone, reviewLoginCodeHash: codeHash }
          : { riderReviewLoginEnabled: enabled, riderReviewLoginPhone: phone, riderReviewLoginCodeHash: codeHash }),
        updatedById: adminId,
      },
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
    saveOtpProviderKeys,
    removeOtpProviderKeys,
  };
}
