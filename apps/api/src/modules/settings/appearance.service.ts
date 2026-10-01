import { z } from "zod";

import { env } from "../../config/env.js";
import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { appearanceSchema, type Appearance, type HomeSection, type UpdateAppearanceInput } from "./appearance.schemas.js";

type Db = PrismaClient | Prisma.TransactionClient;

const APPEARANCE_ID = "app";

/** First-run appearance, built from the deployment's environment. */
export function defaultAppearance(): Appearance {
  return {
    appName: env.APP_NAME,
    logoUrl: env.LOGO_URL ?? null,
    theme: {
      colors: {
        primary: env.PRIMARY_COLOR.toUpperCase(),
        onPrimary: "#FFFFFF",
        accent: env.SECONDARY_COLOR.toUpperCase(),
        onAccent: "#1C1C1C",
      },
      radius: 12,
      cardStyle: "outlined",
      colorScheme: "light",
    },
    announcement: { enabled: true, text: "Groceries delivered in minutes", backgroundColor: null, textColor: null },
    homeSections: [{ id: "categories", type: "category_grid", enabled: true, title: "Shop by category", columns: 4, categoryIds: [] }],
  };
}

/**
 * The saved appearance over the defaults. Each top-level part is checked on its own, so a part
 * saved under an older shape falls back to its default without discarding the rest.
 */
export async function getAppearance(db: Db) {
  const row = await db.appAppearance.findUnique({ where: { id: APPEARANCE_ID } });
  const appearance: Appearance = defaultAppearance();

  if (row) {
    const stored = (row.config ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(appearanceSchema.shape) as (keyof Appearance)[]) {
      const parsed = appearanceSchema.shape[key].safeParse(stored[key]);
      if (parsed.success) (appearance as Record<keyof Appearance, unknown>)[key] = parsed.data;
    }
  }

  return { appearance, updatedAt: row?.updatedAt ?? null, updatedById: row?.updatedById ?? null };
}

function categoryReferences(sections: HomeSection[]) {
  return sections.flatMap((section, index): { path: (string | number)[]; id: string }[] => {
    const at = (...path: (string | number)[]) => ["homeSections", index, ...path];
    switch (section.type) {
      case "category_grid":
        return section.categoryIds.map((id, position) => ({ path: at("categoryIds", position), id }));
      case "product_rail":
        return [{ path: at("categoryId"), id: section.categoryId }];
      case "banner_carousel":
        return section.banners.flatMap((banner, position) =>
          banner.link.type === "category" ? [{ path: at("banners", position, "link", "categoryId"), id: banner.link.categoryId }] : [],
        );
      case "offer_strip":
        return section.link.type === "category" ? [{ path: at("link", "categoryId"), id: section.link.categoryId }] : [];
    }
  });
}

export function createAppearanceService(prisma: PrismaClient) {
  async function getAdminAppearance() {
    const { appearance, updatedAt, updatedById } = await getAppearance(prisma);
    return { ...appearance, updatedAt, updatedById };
  }

  /** Inactive categories are allowed (they are hidden in the app until reactivated); deleted ones are not. */
  async function assertCategoriesExist(sections: HomeSection[]) {
    const references = categoryReferences(sections);
    if (references.length === 0) return;

    const found = await prisma.category.findMany({
      where: { id: { in: [...new Set(references.map((reference) => reference.id))] } },
      select: { id: true },
    });
    const existing = new Set(found.map((category) => category.id));
    const missing = references.filter((reference) => !existing.has(reference.id));

    if (missing.length > 0) {
      throw new z.ZodError(
        missing.map((reference) => ({ code: "custom" as const, path: reference.path, message: "This category does not exist", input: reference.id })),
      );
    }
  }

  async function updateAppearance(input: UpdateAppearanceInput, adminId: string) {
    if (input.homeSections) {
      await assertCategoriesExist(input.homeSections);
    }

    const { appearance } = await getAppearance(prisma);
    const config = { ...appearance, ...input } as Prisma.InputJsonValue;

    await prisma.appAppearance.upsert({
      where: { id: APPEARANCE_ID },
      create: { id: APPEARANCE_ID, config, updatedById: adminId },
      update: { config, updatedById: adminId },
    });

    return getAdminAppearance();
  }

  return { getAdminAppearance, updateAppearance };
}
