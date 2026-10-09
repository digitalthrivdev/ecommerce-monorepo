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
    categoryTabs: { enabled: false, tabs: [] },
    homeSections: [{ id: "categories", type: "category_grid", enabled: true, title: "Shop by category", description: null, background: null, columns: 4, categoryIds: [] }],
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

type Path = (string | number)[];

/** The home screen's sections and each tab page's, with the path to each list. */
function sectionLists(input: UpdateAppearanceInput): { path: Path; sections: HomeSection[] }[] {
  return [
    { path: ["homeSections"], sections: input.homeSections ?? [] },
    ...(input.categoryTabs?.tabs ?? []).flatMap((tab, index) =>
      tab.page ? [{ path: ["categoryTabs", "tabs", index, "page", "sections"], sections: tab.page.sections }] : [],
    ),
  ];
}

function categoryReferences(sections: HomeSection[], base: Path) {
  return sections.flatMap((section, index): { path: Path; id: string }[] => {
    const at = (...path: Path) => [...base, index, ...path];
    switch (section.type) {
      case "category_grid":
        return section.categoryIds.map((id, position) => ({ path: at("categoryIds", position), id }));
      case "product_rail":
      case "subcategory_grid":
        return [{ path: at("categoryId"), id: section.categoryId }];
      case "banner_carousel":
        return section.banners.flatMap((banner, position) =>
          banner.link.type === "category" ? [{ path: at("banners", position, "link", "categoryId"), id: banner.link.categoryId }] : [],
        );
      case "offer_strip":
        return section.link.type === "category" ? [{ path: at("link", "categoryId"), id: section.link.categoryId }] : [];
      case "deals_rail":
        return section.categoryId ? [{ path: at("categoryId"), id: section.categoryId }] : [];
      case "category_deals":
        return section.categoryIds.map((id, position) => ({ path: at("categoryIds", position), id }));
      case "sale_hero":
        return section.categoryIds.map((id, position) => ({ path: at("categoryIds", position), id }));
      case "category_collection":
        return section.items.map((item, position) => ({ path: at("items", position, "categoryId"), id: item.categoryId }));
      case "image_tiles":
        return section.tiles.flatMap((tile, position) =>
          tile.link.type === "category" ? [{ path: at("tiles", position, "link", "categoryId"), id: tile.link.categoryId }] : [],
        );
      case "buy_again":
      case "brand_rail":
        return [];
    }
  });
}

function brandReferences(sections: HomeSection[], base: Path) {
  return sections.flatMap((section, index) =>
    section.type === "brand_rail" ? section.brandIds.map((id, position) => ({ path: [...base, index, "brandIds", position], id })) : [],
  );
}

function productReferences(sections: HomeSection[], base: Path) {
  return sections.flatMap((section, index) =>
    section.type === "sale_hero" ? section.productIds.map((id, position) => ({ path: [...base, index, "productIds", position], id })) : [],
  );
}

/** Products picked by hand in the saved home screen and tab pages. */
export async function featuredProductIds(db: Db) {
  const { appearance } = await getAppearance(db);
  return new Set(sectionLists(appearance).flatMap((list) => productReferences(list.sections, list.path).map((reference) => reference.id)));
}

/** Categories used by the saved home screen, its tab pages and the category tabs themselves. */
export async function usedCategoryIds(db: Db) {
  const { appearance } = await getAppearance(db);
  return new Set([
    ...sectionLists(appearance).flatMap((list) => categoryReferences(list.sections, list.path).map((reference) => reference.id)),
    ...appearance.categoryTabs.tabs.map((tab) => tab.categoryId),
  ]);
}

export function createAppearanceService(prisma: PrismaClient) {
  async function getAdminAppearance() {
    const { appearance, updatedAt, updatedById } = await getAppearance(prisma);
    return { ...appearance, updatedAt, updatedById };
  }

  /** Inactive categories are allowed (they are hidden in the app until reactivated); deleted ones are not. */
  async function assertCategoriesExist(input: UpdateAppearanceInput) {
    const references = [
      ...sectionLists(input).flatMap((list) => categoryReferences(list.sections, list.path)),
      ...(input.categoryTabs?.tabs ?? []).map((tab, index) => ({ path: ["categoryTabs", "tabs", index, "categoryId"], id: tab.categoryId })),
    ];
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

  /** Like categories: inactive brands are allowed and hidden in the app; deleted ones are not. */
  async function assertBrandsExist(input: UpdateAppearanceInput) {
    const references = sectionLists(input).flatMap((list) => brandReferences(list.sections, list.path));
    if (references.length === 0) return;

    const found = await prisma.brand.findMany({
      where: { id: { in: [...new Set(references.map((reference) => reference.id))] } },
      select: { id: true },
    });
    const existing = new Set(found.map((brand) => brand.id));
    const missing = references.filter((reference) => !existing.has(reference.id));

    if (missing.length > 0) {
      throw new z.ZodError(
        missing.map((reference) => ({ code: "custom" as const, path: reference.path, message: "This brand does not exist", input: reference.id })),
      );
    }
  }

  /** Like categories: inactive products are allowed and skipped in the app; deleted ones are not. */
  async function assertProductsExist(input: UpdateAppearanceInput) {
    const references = sectionLists(input).flatMap((list) => productReferences(list.sections, list.path));
    if (references.length === 0) return;

    const found = await prisma.product.findMany({
      where: { id: { in: [...new Set(references.map((reference) => reference.id))] } },
      select: { id: true },
    });
    const existing = new Set(found.map((product) => product.id));
    const missing = references.filter((reference) => !existing.has(reference.id));

    if (missing.length > 0) {
      throw new z.ZodError(
        missing.map((reference) => ({ code: "custom" as const, path: reference.path, message: "This product does not exist", input: reference.id })),
      );
    }
  }

  async function updateAppearance(input: UpdateAppearanceInput, adminId: string) {
    await assertCategoriesExist(input);
    await assertBrandsExist(input);
    await assertProductsExist(input);

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
