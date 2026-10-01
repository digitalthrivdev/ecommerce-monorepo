import { env } from "../../config/env.js";
import { PaymentMethod, Prisma, type PrismaClient } from "../../generated/prisma/client";
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

function toAdminView(settings: PlatformSettings) {
  return {
    deliveryFee: settings.deliveryFee.toFixed(2),
    freeDeliveryThreshold: settings.freeDeliveryThreshold?.toFixed(2) ?? null,
    minOrderValue: settings.minOrderValue.toFixed(2),
    deliveryPartnerFee: settings.deliveryPartnerFee.toFixed(2),
    supportPhone: settings.supportPhone,
    supportEmail: settings.supportEmail,
    updatedById: settings.updatedById,
    updatedAt: settings.updatedAt,
  };
}

export function createSettingsService(prisma: PrismaClient) {
  async function getPublicSettings() {
    const settings = await getPlatformSettings(prisma);

    return {
      appName: env.APP_NAME,
      branding: {
        logoUrl: env.LOGO_URL ?? null,
        primaryColor: env.PRIMARY_COLOR,
        secondaryColor: env.SECONDARY_COLOR,
      },
      currency: env.CURRENCY,
      timezone: env.TIMEZONE,
      pricing: {
        deliveryFee: settings.deliveryFee.toFixed(2),
        freeDeliveryThreshold: settings.freeDeliveryThreshold?.toFixed(2) ?? null,
        minOrderValue: settings.minOrderValue.toFixed(2),
      },
      payments: {
        methods: env.PAYMENT_PROVIDER === "none" ? [PaymentMethod.COD] : [PaymentMethod.COD, PaymentMethod.ONLINE],
        onlinePaymentTimeoutMinutes: env.PAYMENT_TIMEOUT_MINUTES,
      },
      support: {
        phone: settings.supportPhone,
        email: settings.supportEmail,
      },
    };
  }

  async function getAdminSettings() {
    return toAdminView(await getPlatformSettings(prisma));
  }

  async function updateSettings(input: UpdateSettingsInput, adminId: string) {
    await getPlatformSettings(prisma);
    const updated = await prisma.platformSettings.update({
      where: { id: SETTINGS_ID },
      data: { ...input, updatedById: adminId },
    });
    return toAdminView(updated);
  }

  return { getPublicSettings, getAdminSettings, updateSettings };
}
