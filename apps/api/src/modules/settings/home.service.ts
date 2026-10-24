import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { inCategory } from "../products/catalog.js";
import { createDiscoveryService } from "../products/discovery.service.js";
import { catalogProductInclude, catalogProductWhere, toProductCards } from "../products/catalog.service.js";
import type { HomeSection } from "./appearance.schemas.js";
import { getAppearance } from "./appearance.service.js";

const categorySelect = { id: true, name: true, slug: true, imageUrl: true, sortOrder: true } satisfies Prisma.CategorySelect;

type HomeCategory = Prisma.CategoryGetPayload<{ select: typeof categorySelect }>;

/** Cap for a grid that shows every active category. */
const ALL_CATEGORIES_LIMIT = 100;
/** Brands shown when the admin hasn't picked any. */
const TOP_BRANDS_LIMIT = 12;
/** Category deal tiles shown when the admin hasn't picked any. */
const TOP_CATEGORY_DEALS_LIMIT = 12;
/** A sale hero's product images per tile. */
const SALE_HERO_TILE_IMAGES = 4;

type SectionLink = Extract<HomeSection, { type: "offer_strip" }>["link"];

function referencedCategoryIds(sections: HomeSection[]) {
  const linked = (link: SectionLink) => (link.type === "category" ? [link.categoryId] : []);
  return sections.flatMap((section) => {
    switch (section.type) {
      case "category_grid":
      case "category_deals":
        return section.categoryIds;
      case "category_collection":
        return section.items.map((item) => item.categoryId);
      case "product_rail":
      case "subcategory_grid":
        return [section.categoryId];
      case "deals_rail":
        return section.categoryId ? [section.categoryId] : [];
      case "sale_hero":
        return section.categoryIds;
      case "banner_carousel":
        return section.banners.flatMap((banner) => linked(banner.link));
      case "image_tiles":
        return section.tiles.flatMap((tile) => linked(tile.link));
      case "offer_strip":
        return linked(section.link);
      case "buy_again":
      case "brand_rail":
        return [];
    }
  });
}

function referencedProductIds(sections: HomeSection[]) {
  const linked = (link: SectionLink) => (link.type === "product" ? [link.productId] : []);
  return sections.flatMap((section) => {
    switch (section.type) {
      case "banner_carousel":
        return section.banners.flatMap((banner) => linked(banner.link));
      case "image_tiles":
        return section.tiles.flatMap((tile) => linked(tile.link));
      case "offer_strip":
        return linked(section.link);
      default:
        return [];
    }
  });
}

/** Shows every top-level category: an empty category grid or category deals list. */
const needsAllCategories = (section: HomeSection) =>
  (section.type === "category_grid" || section.type === "category_deals") && section.categoryIds.length === 0;

export function createHomeService(prisma: PrismaClient) {
  const discovery = createDiscoveryService(prisma);

  /** Products of the category (and its sub-categories) with at least one variant in stock. */
  async function railProducts(categoryId: string, limit: number) {
    const rows = await prisma.product.findMany({
      where: {
        ...catalogProductWhere,
        ...inCategory(categoryId),
        variants: { some: { isActive: true, inventory: { is: { quantity: { gt: 0 } } } } },
      },
      include: catalogProductInclude,
      orderBy: { name: "asc" },
      take: limit,
    });
    return toProductCards(prisma, rows);
  }

  /** The chosen brands (or the top brands) that are active and have something in stock. */
  function railBrands(brandIds: string[]) {
    return brandIds.length === 0
      ? discovery.inStockBrands({ limit: TOP_BRANDS_LIMIT })
      : discovery.inStockBrands({ brandIds, limit: brandIds.length });
  }

  /**
   * The enabled sections with their data filled in. Inactive or deleted categories are dropped (links to
   * them become plain), and sections left with nothing to show are omitted. `extraCategoryIds` are looked
   * up along with the sections' categories and returned in `categories` when active.
   */
  async function resolveSections(allSections: HomeSection[], extraCategoryIds: string[]) {
    const sections = allSections.filter((section) => section.enabled);
    const ids = [...new Set([...referencedCategoryIds(sections), ...extraCategoryIds])];
    const productIds = [...new Set(referencedProductIds(sections))];

    const [referenced, allActive, referencedProducts] = await Promise.all([
      ids.length > 0 ? prisma.category.findMany({ where: { id: { in: ids }, isActive: true }, select: categorySelect }) : [],
      sections.some(needsAllCategories)
        ? prisma.category.findMany({
            where: { isActive: true, parentId: null },
            select: categorySelect,
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            take: ALL_CATEGORIES_LIMIT,
          })
        : [],
      productIds.length > 0
        ? prisma.product.findMany({
            where: { id: { in: productIds }, isActive: true },
            select: { id: true, name: true, slug: true },
          })
        : [],
    ]);
    const categories = new Map<string, HomeCategory>(referenced.map((category) => [category.id, category]));
    const products = new Map(referencedProducts.map((product) => [product.id, product]));

    const resolveLink = (link: SectionLink) => {
      if (link.type === "category") {
        const category = categories.get(link.categoryId);
        return category ? { type: "category" as const, category } : { type: "none" as const };
      }
      if (link.type === "product") {
        const product = products.get(link.productId);
        return product ? { type: "product" as const, product } : { type: "none" as const };
      }
      return { type: "none" as const };
    };

    const resolveSection = async (section: HomeSection) => {
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
          return { id: section.id, type: section.type, title: section.title, description: section.description, columns: section.columns, categories: shown };
        }

        case "product_rail": {
          const category = categories.get(section.categoryId);
          if (!category) return null;
          const products = await railProducts(category.id, section.limit);
          if (products.length === 0) return null;
          return { id: section.id, type: section.type, title: section.title, description: section.description, category, products };
        }

        case "deals_rail": {
          const category = section.categoryId ? categories.get(section.categoryId) : null;
          if (category === undefined) return null;
          const products = await discovery.dealProducts(category?.id ?? null, section.limit);
          if (products.length === 0) return null;
          return { id: section.id, type: section.type, title: section.title, description: section.description, category, products };
        }

        case "buy_again":
          return { id: section.id, type: section.type, title: section.title, description: section.description };

        case "brand_rail": {
          const brands = await railBrands(section.brandIds);
          if (brands.length === 0) return null;
          return { id: section.id, type: section.type, title: section.title, description: section.description, brands };
        }

        case "category_deals": {
          const candidates = section.categoryIds.length
            ? section.categoryIds.flatMap((id) => categories.get(id) ?? [])
            : allActive.slice(0, TOP_CATEGORY_DEALS_LIMIT);
          const discounts = await discovery.categoryDiscounts(candidates.map((category) => category.id));
          const shown = candidates.flatMap((category) => {
            const maxDiscountPercent = discounts.get(category.id) ?? 0;
            return maxDiscountPercent > 0 ? [{ ...category, maxDiscountPercent }] : [];
          });
          if (shown.length === 0) return null;
          return { id: section.id, type: section.type, title: section.title, description: section.description, categories: shown };
        }

        case "sale_hero": {
          const tiles = section.categoryIds.flatMap((id) => categories.get(id) ?? []);
          const [products, discounts, images] = await Promise.all([
            section.productIds.length > 0 ? discovery.productsByIds(section.productIds) : [],
            discovery.categoryDiscounts(tiles.map((category) => category.id)),
            discovery.categoryDealImages(
              tiles.map((category) => category.id),
              SALE_HERO_TILE_IMAGES,
            ),
          ]);
          return {
            id: section.id,
            type: section.type,
            title: section.title,
            subtitle: section.subtitle,
            tagline: section.tagline,
            titleColor: section.titleColor,
            animateTitle: section.animateTitle,
            effect: section.effect,
            icon: section.icon,
            deals:
              products.length > 0
                ? { label: section.dealsLabel ?? "Crazy deals", category: null, products }
                : null,
            categories: tiles.map((category) => ({
              ...category,
              maxDiscountPercent: discounts.get(category.id) ?? 0,
              imageUrls: images.get(category.id) ?? [],
            })),
          };
        }

        case "image_tiles":
          return {
            id: section.id,
            type: section.type,
            title: section.title,
            description: section.description,
            layout: section.layout,
            columns: section.columns,
            tiles: section.tiles.map((tile) => ({ ...tile, link: resolveLink(tile.link) })),
          };

        case "category_collection": {
          const items = section.items.flatMap((item) => {
            const category = categories.get(item.categoryId);
            if (!category) return [];
            return [{ id: item.id, label: item.label ?? category.name, imageUrl: item.imageUrl, badge: item.badge, category }];
          });
          if (items.length === 0) return null;
          return { id: section.id, type: section.type, title: section.title, description: section.description, columns: section.columns, items };
        }

        case "subcategory_grid": {
          const category = categories.get(section.categoryId);
          if (!category) return null;
          const subcategories = await prisma.category.findMany({
            where: { parentId: category.id, isActive: true },
            select: categorySelect,
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            take: section.limit,
          });
          if (subcategories.length === 0) return null;
          return {
            id: section.id,
            type: section.type,
            title: section.title ?? category.name,
            description: section.description,
            columns: section.columns,
            category,
            categories: subcategories,
          };
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
    };

    const resolved = await Promise.all(
      sections.map(async (section) => {
        const content = await resolveSection(section);
        return content && { ...content, background: section.background };
      }),
    );

    return { categories, sections: resolved.filter((section) => section !== null) };
  }

  async function loadAppearance() {
    const { appearance } = await getAppearance(prisma);
    return { appearance, tabs: appearance.categoryTabs.enabled ? appearance.categoryTabs.tabs : [] };
  }

  /**
   * The "All" home screen: the admin's home sections and category tabs. Tabs whose category is inactive
   * or deleted are dropped. A tab icon of null means the category has no image; the app shows its first
   * letter. `header` is set for tabs that open their own page, so the app can recolour before it loads.
   */
  async function getHomeFeed() {
    const { appearance, tabs } = await loadAppearance();
    const { categories, sections } = await resolveSections(
      appearance.homeSections,
      tabs.map((tab) => tab.categoryId),
    );

    const categoryTabs = tabs.flatMap((tab) => {
      const category = categories.get(tab.categoryId);
      if (!category) return [];
      const icon =
        tab.icon.type === "preset"
          ? { type: "preset" as const, name: tab.icon.name }
          : tab.icon.type === "image"
            ? { type: "image" as const, url: tab.icon.url }
            : category.imageUrl
              ? { type: "image" as const, url: category.imageUrl }
              : null;
      const header = tab.opens === "page" && tab.page ? tab.page.header : null;
      return [{ id: tab.id, label: tab.label ?? category.name, icon, badge: tab.badge, category, opens: header ? ("page" as const) : ("category" as const), header }];
    });

    return { categoryTabs, sections };
  }

  /** The sections of a tab that opens its own page; missing like the tab itself when its category is hidden. */
  async function getTabPage(tabId: string) {
    const { tabs } = await loadAppearance();
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab || tab.opens !== "page" || !tab.page) {
      throw new AppError(404, "TAB_NOT_FOUND", "Tab not found");
    }
    const { categories, sections } = await resolveSections(tab.page.sections, [tab.categoryId]);
    if (!categories.has(tab.categoryId)) {
      throw new AppError(404, "TAB_NOT_FOUND", "Tab not found");
    }
    return { tabId: tab.id, sections };
  }

  return { getHomeFeed, getTabPage };
}
