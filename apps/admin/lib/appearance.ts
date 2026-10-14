import { HEX_COLOR_PATTERN } from "@shop/validation";

import type { Appearance, AppearanceTheme, Category, CollectionItem, HomeSection, HomeSectionType, HomeTile, TabHeader, TabPage } from "./types";

type Colors = AppearanceTheme["colors"];

/** Product ids referenced by sale hero sections on the All page and on tab pages. */
export function appearanceProductIds(value: Appearance) {
  const from = (sections: HomeSection[]) => sections.flatMap((section) => (section.type === "sale_hero" ? section.productIds : []));
  return [...new Set([...from(value.homeSections), ...value.categoryTabs.tabs.flatMap((tab) => (tab.page ? from(tab.page.sections) : []))])];
}

export const COLOR_PRESETS: { id: string; name: string; colors: Colors }[] = [
  { id: "fresh", name: "Fresh", colors: { primary: "#0C831F", onPrimary: "#FFFFFF", accent: "#F8CB46", onAccent: "#1C1C1C" } },
  { id: "ocean", name: "Ocean", colors: { primary: "#0B6BCB", onPrimary: "#FFFFFF", accent: "#BAE6FD", onAccent: "#0C2A43" } },
  { id: "berry", name: "Berry", colors: { primary: "#C2185B", onPrimary: "#FFFFFF", accent: "#FCE4EC", onAccent: "#4A0F25" } },
  { id: "citrus", name: "Citrus", colors: { primary: "#E65100", onPrimary: "#FFFFFF", accent: "#FFE082", onAccent: "#3E2723" } },
  { id: "midnight", name: "Midnight", colors: { primary: "#4F46E5", onPrimary: "#FFFFFF", accent: "#1E1B4B", onAccent: "#E0E7FF" } },
];

export const SECTION_LABELS: Record<HomeSectionType, { name: string; description: string }> = {
  banner_carousel: { name: "Banner carousel", description: "Swipeable promotional images" },
  category_grid: { name: "Category grid", description: "Tiles that open a category" },
  product_rail: { name: "Product rail", description: "A horizontal row of products from a category" },
  offer_strip: { name: "Offer strip", description: "A coloured call-out, e.g. free delivery" },
  deals_rail: { name: "Top deals", description: "Products with the biggest discount off MRP" },
  buy_again: { name: "Buy again", description: "What each customer has ordered before" },
  brand_rail: { name: "Brands", description: "A row of brand logos that open the brand's products" },
  category_deals: { name: "Category deals", description: "Category tiles showing \"Up to X% OFF\"" },
  image_tiles: { name: "Image tiles", description: "Images in a grid, or a carousel with buttons" },
  subcategory_grid: { name: "Sub-category grid", description: "The sub-categories of one category, e.g. Hair, Skin & Face" },
  category_collection: { name: "Category collection", description: "Any categories you pick, with your own photos and badges" },
  sale_hero: { name: "Sale hero", description: "An animated sale title with cycling deals and category discounts" },
};

export const isHexColor = (value: string) => HEX_COLOR_PATTERN.test(value);

function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio between two hex colours; null if either is not a full hex colour. */
export function contrastRatio(foreground: string, background: string) {
  if (!isHexColor(foreground) || !isHexColor(background)) return null;
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Mixes a hex colour towards black by `amount` (0–1). */
function darken(hex: string, amount: number) {
  const channel = (offset: number) => Math.round(Number.parseInt(hex.slice(offset, offset + 2), 16) * (1 - amount));
  return `#${[1, 3, 5].map((offset) => channel(offset).toString(16).padStart(2, "0")).join("")}`;
}

/** The colour, darkened just enough to read as normal-size text on `background` (WCAG AA, 4.5:1). */
export function readableOn(hex: string, background = "#FFFFFF") {
  if (!isHexColor(hex)) return hex;
  for (let amount = 0; amount <= 1; amount += 0.05) {
    const candidate = darken(hex, amount);
    if ((contrastRatio(candidate, background) ?? 0) >= 4.5) return candidate;
  }
  return "#000000";
}

export const newId = () => crypto.randomUUID();

export function newSection(type: HomeSectionType, categories: Category[], colors: Colors): HomeSection {
  const id = newId();
  const firstCategory = categories.find((category) => category.isActive)?.id ?? "";
  switch (type) {
    case "banner_carousel":
      return { id, type, enabled: true, background: null, autoplay: true, banners: [{ id: newId(), imageUrl: "", title: null, subtitle: null, link: { type: "none" } }] };
    case "category_grid":
      return { id, type, enabled: true, background: null, title: "Shop by category", description: null, columns: 4, categoryIds: [] };
    case "product_rail":
      return { id, type, enabled: true, background: null, title: "Bestsellers", description: null, categoryId: firstCategory, limit: 10 };
    case "offer_strip":
      return {
        id,
        type,
        enabled: true, background: null,
        title: "Free delivery on your first order",
        subtitle: null,
        imageUrl: null,
        backgroundColor: colors.accent,
        textColor: colors.onAccent,
        link: { type: "none" },
      };
    case "deals_rail":
      return { id, type, enabled: true, background: null, title: "Top deals", description: null, categoryId: null, limit: 10 };
    case "buy_again":
      return { id, type, enabled: true, background: null, title: "Buy again", description: null };
    case "brand_rail":
      return { id, type, enabled: true, background: null, title: "Top brands", description: null, brandIds: [] };
    case "category_deals":
      return { id, type, enabled: true, background: null, title: "Mega price drops", description: null, categoryIds: [] };
    case "image_tiles":
      return {
        id,
        type,
        enabled: true, background: null,
        title: null,
        description: null,
        layout: "grid",
        columns: 2,
        tiles: [newTile(), newTile()],
      };
    case "subcategory_grid": {
      const parent = categories.find((category) => category.isActive && category.childCount > 0) ?? categories.find((category) => category.isActive);
      return { id, type, enabled: true, background: null, title: null, description: null, categoryId: parent?.id ?? "", columns: 4, limit: 8 };
    }
    case "category_collection": {
      const picked = categories.filter((category) => category.isActive).slice(0, 4);
      return { id, type, enabled: true, background: null, title: "Shop by collection", description: null, columns: 4, items: picked.map((category) => newCollectionItem(category.id)) };
    }
    case "sale_hero":
      return {
        id,
        type,
        enabled: true,
        background: { color: colors.primary, textColor: colors.onPrimary, edge: "wave" },
        title: "MEGA SALE",
        subtitle: null,
        tagline: null,
        titleColor: "#FFFFFF",
        animateTitle: true,
        effect: "sparkles",
        icon: "zap",
        dealsLabel: "Crazy deals",
        productIds: [],
        categoryIds: [],
      };
  }
}

export const newCollectionItem = (categoryId = ""): CollectionItem => ({ id: newId(), categoryId, imageUrl: null, label: null, badge: null });

/** A copy with fresh ids for the section and its banners, tiles or items, so both can be edited apart. */
export function duplicateSection(section: HomeSection): HomeSection {
  const copy = { ...structuredClone(section), id: newId() };
  switch (copy.type) {
    case "banner_carousel":
      return { ...copy, banners: copy.banners.map((banner) => ({ ...banner, id: newId() })) };
    case "image_tiles":
      return { ...copy, tiles: copy.tiles.map((tile) => ({ ...tile, id: newId() })) };
    case "category_collection":
      return { ...copy, items: copy.items.map((item) => ({ ...item, id: newId() })) };
    default:
      return copy;
  }
}

export const newTile = (): HomeTile => ({ id: newId(), imageUrl: "", link: { type: "none" }, buttonLabel: null });

/** The header the "All" screen uses. */
export const defaultTabHeader = (colors: Colors): TabHeader => ({ color: colors.accent, gradientColor: null, textColor: colors.onAccent, imageUrl: null });

export const newTabPage = (colors: Colors): TabPage => ({ header: defaultTabHeader(colors), sections: [] });

/** The "All" home screen, as opposed to a tab's page, in the section editor and preview. */
export const HOME_PAGE = "all";

/** Applies `update` to the sections of the "All" screen (HOME_PAGE) or of the tab page with that id. */
export function withSections(value: Appearance, page: string, update: (sections: HomeSection[]) => HomeSection[]): Appearance {
  if (page === HOME_PAGE) return { ...value, homeSections: update(value.homeSections) };
  const tabs = value.categoryTabs.tabs.map((tab) => (tab.id === page && tab.page ? { ...tab, page: { ...tab.page, sections: update(tab.page.sections) } } : tab));
  return { ...value, categoryTabs: { ...value.categoryTabs, tabs } };
}

/** Tabs that show their own page, in tab order, with their position in `categoryTabs.tabs`. */
export function pageTabs(value: Appearance, categories: Category[]) {
  if (!value.categoryTabs.enabled) return [];
  return value.categoryTabs.tabs.flatMap((tab, index) =>
    tab.opens === "page" && tab.page
      ? [{ tab, index, page: tab.page, label: tab.label ?? categories.find((category) => category.id === tab.categoryId)?.name ?? `Tab ${index + 1}` }]
      : [],
  );
}

const FIELD_NAMES: Record<string, string> = {
  appName: "App name",
  logoUrl: "Logo URL",
  imageUrl: "Image URL",
  categoryId: "Category",
  categoryIds: "Categories",
  brandIds: "Brands",
  buttonLabel: "Button text",
  description: "Description",
  url: "Icon image URL",
  backgroundColor: "Background colour",
  textColor: "Text colour",
  color: "Colour",
  gradientColor: "Gradient colour",
  edge: "Bottom edge",
  titleColor: "Title colour",
  dealsLabel: "Deals card heading",
  productIds: "Featured products",
  effect: "Background effect",
};

/**
 * "homeSections.2.banners.0.imageUrl" → "Home screen › Section 3 › Banner 1 › Image URL";
 * "categoryTabs.tabs.1.page.sections.0.title" → "Category tabs › Tab 2 › Page › Section 1 › Title".
 */
export function describeErrorPath(path: string) {
  const parts = path.split(".");
  const labels: string[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    const next = parts[index + 1];
    if (part === "homeSections") labels.push("Home screen");
    else if (part === "categoryTabs") labels.push("Category tabs");
    else if (part === "tabs") labels.push(next === undefined ? "Tabs" : `Tab ${Number(next) + 1}`);
    else if (part === "page") labels.push("Page");
    else if (part === "header") labels.push("Header");
    else if (part === "sections") labels.push(next === undefined ? "Sections" : `Section ${Number(next) + 1}`);
    else if (part === "theme" || part === "colors") continue;
    else if (part === "announcement") labels.push("Announcement");
    else if (part === "banners") labels.push(`Banner ${Number(next) + 1}`);
    else if (part === "tiles") labels.push(`Tile ${Number(next) + 1}`);
    else if (part === "items") labels.push(next === undefined ? "Categories" : `Category ${Number(next) + 1}`);
    else if (/^\d+$/.test(part)) {
      if (parts[index - 1] === "homeSections") labels.push(`Section ${Number(part) + 1}`);
    } else labels.push(FIELD_NAMES[part] ?? part.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()));
  }
  return labels.join(" › ");
}
