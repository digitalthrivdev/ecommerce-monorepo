import { z } from "zod";

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Use a hex colour like #0C831F")
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
});

const sectionBase = { id: itemId, enabled: z.boolean() };

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
    columns: z.union([z.literal(3), z.literal(4)]),
    /** Empty shows every active category in catalog order. */
    categoryIds: z.array(categoryId).max(24, "Choose at most 24 categories"),
  }),
  z.object({
    ...sectionBase,
    type: z.literal("product_rail"),
    title: label(40, "a title"),
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
    /** Null takes deals from every category. */
    categoryId: categoryId.nullable(),
    limit: z.int().min(4, "Show at least 4 products").max(20, "Show at most 20 products"),
  }),
  z.object({
    ...sectionBase,
    /** What the signed-in customer has ordered before; the app loads it for each customer. */
    type: z.literal("buy_again"),
    title: label(40, "a title"),
  }),
  z.object({
    ...sectionBase,
    type: z.literal("brand_rail"),
    title: label(40, "a title"),
    /** Empty shows the brands with the most products in stock at the customer's store. */
    brandIds: z.array(brandId).max(20, "Choose at most 20 brands"),
  }),
  z.object({
    ...sectionBase,
    /** Category tiles showing their biggest discount, e.g. "Up to 40% OFF". */
    type: z.literal("category_deals"),
    title: label(40, "a title"),
    /** Empty uses every top-level category. Categories without a discount at the store are left out. */
    categoryIds: z.array(categoryId).max(12, "Choose at most 12 categories"),
  }),
  z.object({
    ...sectionBase,
    /** Small images side by side, each optionally opening a category. */
    type: z.literal("image_tiles"),
    title: optionalLabel(40),
    columns: z.union([z.literal(2), z.literal(3)]),
    tiles: z.array(tileSchema).min(2, "Add at least two tiles").max(9, "Use at most 9 tiles"),
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

export const appearanceSchema = z.object({
  appName: label(50, "the app name"),
  logoUrl: imageUrl.nullable(),
  theme: themeSchema,
  announcement: announcementSchema,
  homeSections: homeSectionsSchema,
});

/** Replaces the given top-level parts; omitted parts are kept. */
export const updateAppearanceBodySchema = appearanceSchema
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one part to update");

export const homeQuerySchema = z.object({
  storeId: z.string().trim().min(1).max(64).optional(),
});

export type Appearance = z.infer<typeof appearanceSchema>;
export type HomeSection = z.infer<typeof homeSectionSchema>;
export type UpdateAppearanceInput = z.infer<typeof updateAppearanceBodySchema>;
