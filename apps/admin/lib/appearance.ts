import type { AppearanceTheme, Category, CollectionItem, HomeSection, HomeSectionType, HomeTile } from "./types";

type Colors = AppearanceTheme["colors"];

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
};

export const isHexColor = (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value);

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
      return { id, type, enabled: true, autoplay: true, banners: [{ id: newId(), imageUrl: "", title: null, subtitle: null, link: { type: "none" } }] };
    case "category_grid":
      return { id, type, enabled: true, title: "Shop by category", description: null, columns: 4, categoryIds: [] };
    case "product_rail":
      return { id, type, enabled: true, title: "Bestsellers", description: null, categoryId: firstCategory, limit: 10 };
    case "offer_strip":
      return {
        id,
        type,
        enabled: true,
        title: "Free delivery on your first order",
        subtitle: null,
        imageUrl: null,
        backgroundColor: colors.accent,
        textColor: colors.onAccent,
        link: { type: "none" },
      };
    case "deals_rail":
      return { id, type, enabled: true, title: "Top deals", description: null, categoryId: null, limit: 10 };
    case "buy_again":
      return { id, type, enabled: true, title: "Buy again", description: null };
    case "brand_rail":
      return { id, type, enabled: true, title: "Top brands", description: null, brandIds: [] };
    case "category_deals":
      return { id, type, enabled: true, title: "Mega price drops", description: null, categoryIds: [] };
    case "image_tiles":
      return {
        id,
        type,
        enabled: true,
        title: null,
        description: null,
        layout: "grid",
        columns: 2,
        tiles: [newTile(), newTile()],
      };
    case "subcategory_grid": {
      const parent = categories.find((category) => category.isActive && category.childCount > 0) ?? categories.find((category) => category.isActive);
      return { id, type, enabled: true, title: null, description: null, categoryId: parent?.id ?? "", columns: 4, limit: 8 };
    }
    case "category_collection": {
      const picked = categories.filter((category) => category.isActive).slice(0, 4);
      return { id, type, enabled: true, title: "Shop by collection", description: null, columns: 4, items: picked.map((category) => newCollectionItem(category.id)) };
    }
  }
}

export const newCollectionItem = (categoryId = ""): CollectionItem => ({ id: newId(), categoryId, imageUrl: null, label: null, badge: null });

export const newTile = (): HomeTile => ({ id: newId(), imageUrl: "", link: { type: "none" }, buttonLabel: null });

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
};

/** "homeSections.2.banners.0.imageUrl" → "Home screen › Section 3 › Banner 1 › Image URL". */
export function describeErrorPath(path: string) {
  const parts = path.split(".");
  const labels: string[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    const next = parts[index + 1];
    if (part === "homeSections") labels.push("Home screen");
    else if (part === "categoryTabs") labels.push("Category tabs");
    else if (part === "tabs") labels.push(next === undefined ? "Tabs" : `Tab ${Number(next) + 1}`);
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
