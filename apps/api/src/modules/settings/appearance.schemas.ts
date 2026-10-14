import { HEX_COLOR_PATTERN } from "@shop/validation";
import { z } from "zod";

const hexColor = z
  .string()
  .trim()
  .regex(HEX_COLOR_PATTERN, "Use a hex colour like #0C831F")
  .transform((value) => value.toUpperCase());

const imageUrl = z
  .string()
  .trim()
  .max(500, "Keep the URL under 500 characters")
  .pipe(z.url({ protocol: /^https?$/, error: "Enter a full image URL starting with https://" }));

const label = (max: number, what: string) =>
  z.string().trim().min(1, `Enter ${what}`).max(max, `Keep this under ${max} characters`);

const optionalLabel = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .nullish()
    .transform((value) => value || null);

const categoryId = z.string().trim().min(1, "Choose a category").max(64);

/** Client-generated, stable across edits so the admin editor and apps can key list items. */
const itemId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,40}$/, "Invalid id");

/** Where tapping a banner or offer goes. Products can be added once the admin has a product picker. */
const linkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("category"), categoryId }),
]);

export const themeSchema = z.object({
  colors: z.object({
    /** Buttons, prices, "Add" actions. */
    primary: hexColor,
    /** Text and icons on primary. */
    onPrimary: hexColor,
    /** Header, highlights and badges. */
    accent: hexColor,
    onAccent: hexColor,
  }),
  /** Corner radius in points for cards, buttons and inputs. */
  radius: z.int("Enter a whole number").min(0, "Use 0 to 24").max(24, "Use 0 to 24"),
  cardStyle: z.enum(["flat", "outlined", "elevated"]),
  colorScheme: z.enum(["light", "dark", "system"]),
});

export const announcementSchema = z
  .object({
    enabled: z.boolean(),
    text: z.string().trim().max(80, "Keep this under 80 characters"),
    /** Null uses the accent colours. */
    backgroundColor: hexColor.nullable(),
    textColor: hexColor.nullable(),
  })
  .refine((value) => !value.enabled || value.text.length > 0, { path: ["text"], message: "Enter the announcement text" });

const bannerSchema = z.object({
  id: itemId,
  imageUrl,
  title: optionalLabel(60),
  subtitle: optionalLabel(100),
  link: linkSchema,
});

const brandId = z.string().trim().min(1, "Choose a brand").max(64);

const tileSchema = z.object({
  id: itemId,
  imageUrl,
  link: linkSchema,
  /** Shown on the tile in the carousel layout, e.g. "Order now". */
  buttonLabel: optionalLabel(20),
});

/** Lucide icon names the admin can pick for a category tab; the apps map each to its icon. */
export const CATEGORY_TAB_ICONS = [
  "shopping-basket",
  "store",
  "apple",
  "banana",
  "carrot",
  "cherry",
  "citrus",
  "grape",
  "salad",
  "sprout",
  "leaf",
  "milk",
  "egg",
  "croissant",
  "wheat",
  "nut",
  "cookie",
  "candy",
  "lollipop",
  "popcorn",
  "cake-slice",
  "ice-cream-cone",
  "dessert",
  "coffee",
  "cup-soda",
  "beer",
  "wine",
  "beef",
  "drumstick",
  "fish",
  "pizza",
  "sandwich",
  "soup",
  "utensils",
  "flame",
  "snowflake",
  "baby",
  "sparkles",
  "spray-can",
  "bath",
  "shower-head",
  "brush",
  "scissors",
  "washing-machine",
  "pill",
  "heart-pulse",
  "paw-print",
  "dog",
  "cat",
  "shirt",
  "gem",
  "watch",
  "glasses",
  "smartphone",
  "headphones",
  "tv",
  "plug",
  "lamp",
  "refrigerator",
  "house",
  "hammer",
  "pencil",
  "book-open",
  "gamepad-2",
  "toy-brick",
  "dumbbell",
  "bike",
  "flower-2",
  "gift",
  "party-popper",
  "tag",
  "percent",
  "star",
  "zap",
] as const;

const tabIconSchema = z.discriminatedUnion("type", [
  /** The category's own image. */
  z.object({ type: z.literal("category") }),
  z.object({ type: z.literal("preset"), name: z.enum(CATEGORY_TAB_ICONS, "Choose an icon") }),
  z.object({ type: z.literal("image"), url: imageUrl }),
]);

export const SECTION_EDGES = ["straight", "zigzag", "wave"] as const;

/** Shapes drifting behind a sale hero's title. */
export const SALE_HERO_EFFECTS = ["none", "snow", "sparkles", "confetti", "hearts"] as const;

/** A coloured band behind a section; `edge` shapes its bottom border, e.g. a paper-cut zigzag. Null keeps the page background. */
const sectionBackground = z
  .object({
    color: hexColor,
    /** For the title and the labels that sit on the band; cards keep their own colours. */
    textColor: hexColor,
    edge: z.enum(SECTION_EDGES, "Choose an edge"),
  })
  .nullish()
  .transform((value) => value ?? null);

const sectionBase = { id: itemId, enabled: z.boolean(), background: sectionBackground };

/** A line under a section's title, e.g. "Fresh picks for your week". */
const sectionDescription = optionalLabel(100);

export const homeSectionSchema = z.discriminatedUnion("type", [
  z.object({
    ...sectionBase,
    type: z.literal("banner_carousel"),
    banners: z.array(bannerSchema).min(1, "Add at least one banner").max(10, "Use at most 10 banners"),
    autoplay: z.boolean(),
  }),
  z.object({
    ...sectionBase,
    type: z.literal("category_grid"),
    title: optionalLabel(40),
    description: sectionDescription,
    columns: z.union([z.literal(3), z.literal(4)]),
    /** Empty shows every active category in catalog order. */
    categoryIds: z.array(categoryId).max(24, "Choose at most 24 categories"),
  }),
  z.object({
    ...sectionBase,
    type: z.literal("product_rail"),
    title: label(40, "a title"),
    description: sectionDescription,
    categoryId,
    limit: z.int().min(4, "Show at least 4 products").max(20, "Show at most 20 products"),
  }),
  z.object({
    ...sectionBase,
    type: z.literal("offer_strip"),
    title: label(60, "a title"),
    subtitle: optionalLabel(100),
    imageUrl: imageUrl.nullish().transform((value) => value ?? null),
    backgroundColor: hexColor,
    textColor: hexColor,
    link: linkSchema,
  }),
  z.object({
    ...sectionBase,
    /** In-stock products with the biggest discount off MRP. */
    type: z.literal("deals_rail"),
    title: label(40, "a title"),
    description: sectionDescription,
    /** Null takes deals from every category. */
    categoryId: categoryId.nullable(),
    limit: z.int().min(4, "Show at least 4 products").max(20, "Show at most 20 products"),
  }),
  z.object({
    ...sectionBase,
    /** What the signed-in customer has ordered before; the app loads it for each customer. */
    type: z.literal("buy_again"),
    title: label(40, "a title"),
    description: sectionDescription,
  }),
  z.object({
    ...sectionBase,
    type: z.literal("brand_rail"),
    title: label(40, "a title"),
    description: sectionDescription,
    /** Empty shows the brands with the most products in stock at the customer's store. */
    brandIds: z.array(brandId).max(20, "Choose at most 20 brands"),
  }),
  z.object({
    ...sectionBase,
    /** Category tiles showing their biggest discount, e.g. "Up to 40% OFF". */
    type: z.literal("category_deals"),
    title: label(40, "a title"),
    description: sectionDescription,
    /** Empty uses every top-level category. Categories without a discount at the store are left out. */
    categoryIds: z.array(categoryId).max(12, "Choose at most 12 categories"),
  }),
  z.object({
    ...sectionBase,
    /** Images each optionally opening a category: side by side, or a carousel with the neighbours peeking in. */
    type: z.literal("image_tiles"),
    title: optionalLabel(40),
    description: sectionDescription,
    layout: z.enum(["grid", "carousel"]).default("grid"),
    /** Grid layout only. */
    columns: z.union([z.literal(2), z.literal(3)]),
    tiles: z.array(tileSchema).min(2, "Add at least two tiles").max(9, "Use at most 9 tiles"),
  }),
  z.object({
    ...sectionBase,
    /** The sub-categories of one category, e.g. "Beauty & Personal Care" → Hair, Skin & Face, … */
    type: z.literal("subcategory_grid"),
    /** Null uses the category name. */
    title: optionalLabel(40),
    description: sectionDescription,
    categoryId,
    columns: z.union([z.literal(3), z.literal(4)]),
    limit: z.int().min(3, "Show at least 3 sub-categories").max(12, "Show at most 12 sub-categories"),
  }),
  z.object({
    ...sectionBase,
    /** Hand-picked categories, each with an optional photo, name and badge of the admin's choosing. */
    type: z.literal("category_collection"),
    title: optionalLabel(40),
    description: sectionDescription,
    columns: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)], "Choose 2 to 5 per row"),
    items: z
      .array(
        z.object({
          id: itemId,
          categoryId,
          /** Null uses the category's image. */
          imageUrl: imageUrl.nullish().transform((value) => value ?? null),
          /** Null uses the category name. */
          label: optionalLabel(24),
          /** e.g. "New" or "Up to 40% OFF". */
          badge: optionalLabel(16),
        }),
      )
      .min(1, "Add at least one category")
      .max(24, "Use at most 24 categories"),
  }),
  z.object({
    ...sectionBase,
    /** A festive sale block: an animated title, hand-picked products that cycle in a card, and hand-picked category tiles. */
    type: z.literal("sale_hero"),
    title: label(20, "a title"),
    subtitle: optionalLabel(20),
    /** e.g. "30th Nov – 7th Dec". */
    tagline: optionalLabel(50),
    titleColor: hexColor,
    /** The title's letters bounce one after another. */
    animateTitle: z.boolean(),
    effect: z.enum(SALE_HERO_EFFECTS, "Choose an effect"),
    /** Shown on both sides of the title; null for none. */
    icon: z.enum(CATEGORY_TAB_ICONS, "Choose an icon").nullable(),
    /** Heading on the cycling products card; null uses "Crazy deals" when there are products. */
    dealsLabel: optionalLabel(20),
    /** Products to cycle in the left card, in this order. Empty hides the card. Out-of-stock ones are skipped in the app. */
    productIds: z.array(z.string().trim().min(1, "Choose a product").max(64)).max(8, "Choose at most 8 products"),
    /** Category tiles on the right, in this order. Empty hides the tiles. */
    categoryIds: z.array(categoryId).max(4, "Choose at most 4 categories"),
  }),
]);

export const homeSectionsSchema = z
  .array(homeSectionSchema)
  .max(20, "Use at most 20 sections")
  .superRefine((sections, context) => {
    const seen = new Set<string>();
    sections.forEach((section, index) => {
      if (seen.has(section.id)) context.addIssue({ code: "custom", path: [index, "id"], message: "Duplicate section id" });
      seen.add(section.id);
    });
  });

/** Recolours the whole home header (status bar, address, search and tab strip) while the tab's page is open. */
const tabHeaderSchema = z.object({
  color: hexColor,
  /** Fades from `color` at the top to this at the bottom; null is a solid colour. */
  gradientColor: hexColor.nullable(),
  textColor: hexColor,
  /** Drawn over the colour across the whole header; GIFs stay animated. */
  imageUrl: imageUrl.nullable(),
});

const tabPageSchema = z.object({ header: tabHeaderSchema, sections: homeSectionsSchema });

/** The row of category shortcuts under the search bar, after a fixed "All" tab. */
export const categoryTabsSchema = z
  .object({
    enabled: z.boolean(),
    tabs: z
      .array(
        z
          .object({
            id: itemId,
            categoryId,
            /** Null uses the category name. */
            label: optionalLabel(16),
            icon: tabIconSchema,
            /** A small tag above the icon, e.g. "New". */
            badge: optionalLabel(8),
            /** "page" shows the tab's own page inside the home screen instead of opening the category screen. */
            opens: z.enum(["category", "page"]).default("category"),
            /** Kept while the tab opens the category, so switching back does not lose the page. */
            page: tabPageSchema.nullish().transform((value) => value ?? null),
          })
          .refine((tab) => tab.opens === "category" || tab.page !== null, { path: ["page"], message: "Set up the tab's page" }),
      )
      .max(12, "Use at most 12 tabs"),
  })
  .refine((value) => !value.enabled || value.tabs.length > 0, { path: ["tabs"], message: "Add at least one category tab" });

export const appearanceSchema = z.object({
  appName: label(50, "the app name"),
  logoUrl: imageUrl.nullable(),
  theme: themeSchema,
  announcement: announcementSchema,
  categoryTabs: categoryTabsSchema,
  homeSections: homeSectionsSchema,
});

/** Replaces the given top-level parts; omitted parts are kept. */
export const updateAppearanceBodySchema = appearanceSchema
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one part to update");

export const homeQuerySchema = z.object({
  storeId: z.string().trim().min(1).max(64).optional(),
  /** Returns that tab's page instead of the "All" home screen. */
  tabId: itemId.optional(),
});

export type Appearance = z.infer<typeof appearanceSchema>;
export type HomeSection = z.infer<typeof homeSectionSchema>;
export type CategoryTabs = z.infer<typeof categoryTabsSchema>;
export type CategoryTab = CategoryTabs["tabs"][number];
export type UpdateAppearanceInput = z.infer<typeof updateAppearanceBodySchema>;
