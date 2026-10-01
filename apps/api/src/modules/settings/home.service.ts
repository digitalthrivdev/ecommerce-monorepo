import { StoreStatus, type Prisma, type PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { customerVisible, storeProductInclude, toStoreProductView } from "../products/store-products.service.js";
import type { HomeSection } from "./appearance.schemas.js";
import { getAppearance } from "./appearance.service.js";

const categorySelect = { id: true, name: true, slug: true, imageUrl: true, sortOrder: true } satisfies Prisma.CategorySelect;

type HomeCategory = Prisma.CategoryGetPayload<{ select: typeof categorySelect }>;

/** Cap for a grid that shows every active category. */
const ALL_CATEGORIES_LIMIT = 100;

type SectionLink = Extract<HomeSection, { type: "offer_strip" }>["link"];

function referencedCategoryIds(sections: HomeSection[]) {
  const linked = (link: SectionLink) => (link.type === "category" ? [link.categoryId] : []);
  return sections.flatMap((section) => {
    switch (section.type) {
      case "category_grid":
        return section.categoryIds;
      case "product_rail":
        return [section.categoryId];
      case "banner_carousel":
        return section.banners.flatMap((banner) => linked(banner.link));
      case "offer_strip":
        return linked(section.link);
    }
  });
}

export function createHomeService(prisma: PrismaClient) {
  async function assertActiveStore(storeId: string) {
    const store = await prisma.store.findFirst({ where: { id: storeId, status: StoreStatus.ACTIVE }, select: { id: true } });
    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Store not found");
    }
  }

  async function railProducts(storeId: string, categoryId: string, limit: number) {
    const rows = await prisma.storeProduct.findMany({
      where: {
        storeId,
        ...customerVisible,
        product: { ...customerVisible.product, categoryId },
        inventory: { quantity: { gt: 0 } },
      },
      include: storeProductInclude,
      orderBy: { product: { name: "asc" } },
      take: limit,
    });
    return rows.map((row) => toStoreProductView(row, { includeStock: false }));
  }

  /**
   * The admin's enabled home sections with their data filled in. Inactive or deleted categories are
   * dropped (links to them become plain), and sections left with nothing to show are omitted.
   * Product rails depend on the store's stock, so they are only included when a store is given.
   */
  async function getHomeFeed(storeId: string | undefined) {
    const [{ appearance }] = await Promise.all([getAppearance(prisma), storeId ? assertActiveStore(storeId) : undefined]);
    const sections = appearance.homeSections.filter((section) => section.enabled);

    const needsAllCategories = sections.some((section) => section.type === "category_grid" && section.categoryIds.length === 0);
    const ids = [...new Set(referencedCategoryIds(sections))];

    const [referenced, allActive] = await Promise.all([
      ids.length > 0 ? prisma.category.findMany({ where: { id: { in: ids }, isActive: true }, select: categorySelect }) : [],
      needsAllCategories
        ? prisma.category.findMany({
            where: { isActive: true },
            select: categorySelect,
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            take: ALL_CATEGORIES_LIMIT,
          })
        : [],
    ]);
    const categories = new Map<string, HomeCategory>(referenced.map((category) => [category.id, category]));

    const resolveLink = (link: SectionLink) => {
      const category = link.type === "category" ? categories.get(link.categoryId) : undefined;
      return category ? { type: "category" as const, category } : { type: "none" as const };
    };

    const resolved = await Promise.all(
      sections.map(async (section) => {
        switch (section.type) {
          case "banner_carousel":
            return {
              id: section.id,
              type: section.type,
              autoplay: section.autoplay,
              banners: section.banners.map((banner) => ({ ...banner, link: resolveLink(banner.link) })),
            };

          case "category_grid": {
            const shown = section.categoryIds.length
              ? section.categoryIds.flatMap((id) => categories.get(id) ?? [])
              : allActive;
            if (shown.length === 0) return null;
            return { id: section.id, type: section.type, title: section.title, columns: section.columns, categories: shown };
          }

          case "product_rail": {
            const category = categories.get(section.categoryId);
            if (!storeId || !category) return null;
            const products = await railProducts(storeId, category.id, section.limit);
            if (products.length === 0) return null;
            return { id: section.id, type: section.type, title: section.title, category, products };
          }

          case "offer_strip":
            return {
              id: section.id,
              type: section.type,
              title: section.title,
              subtitle: section.subtitle,
              imageUrl: section.imageUrl,
              backgroundColor: section.backgroundColor,
              textColor: section.textColor,
              link: resolveLink(section.link),
            };
        }
      }),
    );

    return { storeId: storeId ?? null, sections: resolved.filter((section) => section !== null) };
  }

  return { getHomeFeed };
}
