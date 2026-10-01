import type { AppearanceTheme, Category, HomeSection, HomeSectionType } from "./types";

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

export const newId = () => crypto.randomUUID();

export function newSection(type: HomeSectionType, categories: Category[], colors: Colors): HomeSection {
  const id = newId();
  const firstCategory = categories.find((category) => category.isActive)?.id ?? "";
  switch (type) {
    case "banner_carousel":
      return { id, type, enabled: true, autoplay: true, banners: [{ id: newId(), imageUrl: "", title: null, subtitle: null, link: { type: "none" } }] };
    case "category_grid":
      return { id, type, enabled: true, title: "Shop by category", columns: 4, categoryIds: [] };
    case "product_rail":
      return { id, type, enabled: true, title: "Bestsellers", categoryId: firstCategory, limit: 10 };
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
  }
}

const FIELD_NAMES: Record<string, string> = {
  appName: "App name",
  logoUrl: "Logo URL",
  imageUrl: "Image URL",
  categoryId: "Category",
  categoryIds: "Categories",
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
    else if (part === "theme" || part === "colors") continue;
    else if (part === "announcement") labels.push("Announcement");
    else if (part === "banners") labels.push(`Banner ${Number(next) + 1}`);
    else if (/^\d+$/.test(part)) {
      if (parts[index - 1] === "homeSections") labels.push(`Section ${Number(part) + 1}`);
    } else labels.push(FIELD_NAMES[part] ?? part.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()));
  }
  return labels.join(" › ");
}
