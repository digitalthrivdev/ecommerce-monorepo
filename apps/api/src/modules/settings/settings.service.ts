import { env } from "../../config/env.js";
import { PaymentMethod, Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { canStoreSecrets } from "../../shared/secret-box.js";
import type { OtpRegistry } from "../auth/otp-registry.js";
import {
  activePaymentProvider,
  getPaymentProvider,
  paymentGatewayOptions,
  removeGatewayCredentials,
  saveGatewayCredentials,
} from "../payments/gateway-registry.js";
import { getAppearance } from "./appearance.service.js";
import type { UpdateSettingsInput } from "./settings.schemas.js";

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

/** Delivery fee and totals for a subtotal. Used for the cart preview and at checkout so they always agree. */
export function calculateCharges(subtotal: Prisma.Decimal, settings: PlatformSettings) {
  const freeDelivery =
    settings.freeDeliveryThreshold !== null && subtotal.gte(settings.freeDeliveryThreshold);
  const deliveryFee = freeDelivery ? new Prisma.Decimal(0) : settings.deliveryFee;
  const discount = new Prisma.Decimal(0);

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

async function toAdminView(prisma: PrismaClient, otp: OtpRegistry, settings: PlatformSettings) {
  return {
    deliveryFee: settings.deliveryFee.toFixed(2),
    freeDeliveryThreshold: settings.freeDeliveryThreshold?.toFixed(2) ?? null,
    minOrderValue: settings.minOrderValue.toFixed(2),
    deliveryPartnerFee: settings.deliveryPartnerFee.toFixed(2),
    supportPhone: settings.supportPhone,
    supportEmail: settings.supportEmail,
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
      payments: {
        methods: (await activePaymentProvider(prisma, settings)) ? [PaymentMethod.COD, PaymentMethod.ONLINE] : [PaymentMethod.COD],
        onlinePaymentTimeoutMinutes: env.PAYMENT_TIMEOUT_MINUTES,
      },
      support: {
        phone: settings.supportPhone,
        email: settings.supportEmail,
      },
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

  return {
    getPublicSettings,
    getAdminSettings,
    updateSettings,
    saveGatewayKeys,
    removeGatewayKeys,
    saveOtpProviderKeys,
    removeOtpProviderKeys,
  };
}
