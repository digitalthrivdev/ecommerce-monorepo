import { UserRole } from "../../generated/prisma/client";

import { env } from "../../config/env.js";
import { saveVariants } from "../../modules/products/variants.js";
import { hashPassword } from "../../shared/password.js";
import { prisma } from "./prisma.js";

type SeedVariant = {
  sku: string;
  unit: string;
  quantity: string;
  sellingPrice: string;
  mrp: string;
  stock: number;
  /** One value per product option, in order. */
  optionValues?: string[];
  maxOrderQuantity?: number;
};

type SeedProduct = {
  slug: string;
  name: string;
  /** Sub-category slug. */
  sub: string;
  brand?: string;
  tags?: string[];
  hsnCode: string;
  gstRate: string;
  isVeg?: boolean;
  details?: {
    countryOfOrigin?: string;
    shelfLife?: string;
    ingredients?: string;
  };
  options?: { name: string; values: string[] }[];
  variants: SeedVariant[];
};

type SeedCategory = {
  slug: string;
  name: string;
  subcategories: { slug: string; name: string }[];
  products: SeedProduct[];
};

/** A product without options: its one variant's SKU is the slug in upper case. */
function single(
  slug: string,
  unit: string,
  quantity: string,
  sellingPrice: string,
  mrp: string,
  stock: number,
  extra: Partial<SeedVariant> = {},
): SeedVariant[] {
  return [{ sku: slug.toUpperCase(), unit, quantity, sellingPrice, mrp, stock, ...extra }];
}

// Development only; the seed refuses to run in production.
const DEV_PASSWORD = "shop-dev";

const users = [
  { phone: "+919000000001", name: "Platform Admin", email: "admin@shop.test", role: UserRole.ADMIN },
  { phone: "+919000000002", name: "Test Customer", email: null, role: UserRole.CUSTOMER },
];

const storeStaff = { phone: "+919000000003", name: "Koramangala Store Staff", email: "staff@shop.test" };

const store = {
  code: "BLR-KRM-01",
  name: "Koramangala Store",
  phone: "+918000000001",
  addressLine1: "80 Feet Road, 4th Block",
  addressLine2: "Koramangala",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560034",
  latitude: "12.9352000",
  longitude: "77.6245000",
  serviceRadiusKm: "5.00",
};

// HSN codes and GST rates are typical values for these goods, for development data only.
const brands = [
  { slug: "amul", name: "Amul", manufacturer: "Gujarat Cooperative Milk Marketing Federation Ltd.", address: "Amul Dairy Road, Anand, Gujarat 388001" },
  { slug: "britannia", name: "Britannia", manufacturer: "Britannia Industries Ltd.", address: "5/1A Hungerford Street, Kolkata 700017" },
  { slug: "kelloggs", name: "Kellogg's", manufacturer: "Kellogg India Pvt. Ltd.", address: "Mumbai, Maharashtra" },
  { slug: "lays", name: "Lay's", manufacturer: "PepsiCo India Holdings Pvt. Ltd.", address: "Gurugram, Haryana" },
  { slug: "haldirams", name: "Haldiram's", manufacturer: "Haldiram Snacks Pvt. Ltd.", address: "New Delhi" },
  { slug: "parle", name: "Parle", manufacturer: "Parle Products Pvt. Ltd.", address: "Vile Parle (East), Mumbai 400057" },
  { slug: "cadbury", name: "Cadbury", manufacturer: "Mondelez India Foods Pvt. Ltd.", address: "Thane, Maharashtra" },
  { slug: "coca-cola", name: "Coca-Cola", manufacturer: "Hindustan Coca-Cola Beverages Pvt. Ltd.", address: "Bengaluru, Karnataka" },
  { slug: "tata", name: "Tata", manufacturer: "Tata Consumer Products Ltd.", address: "Kolkata, West Bengal" },
  { slug: "nescafe", name: "Nescafe", manufacturer: "Nestle India Ltd.", address: "Gurugram, Haryana" },
  { slug: "real", name: "Real", manufacturer: "Dabur India Ltd.", address: "Ghaziabad, Uttar Pradesh" },
  { slug: "aashirvaad", name: "Aashirvaad", manufacturer: "ITC Ltd.", address: "Kolkata, West Bengal" },
  { slug: "india-gate", name: "India Gate", manufacturer: "KRBL Ltd.", address: "Noida, Uttar Pradesh" },
  { slug: "fortune", name: "Fortune", manufacturer: "Adani Wilmar Ltd.", address: "Ahmedabad, Gujarat" },
  { slug: "colgate", name: "Colgate", manufacturer: "Colgate-Palmolive (India) Ltd.", address: "Mumbai, Maharashtra" },
  { slug: "dove", name: "Dove", manufacturer: "Hindustan Unilever Ltd.", address: "Mumbai, Maharashtra" },
  { slug: "head-shoulders", name: "Head & Shoulders", manufacturer: "Procter & Gamble Home Products Pvt. Ltd.", address: "Mumbai, Maharashtra" },
  { slug: "surf-excel", name: "Surf Excel", manufacturer: "Hindustan Unilever Ltd.", address: "Mumbai, Maharashtra" },
  { slug: "vim", name: "Vim", manufacturer: "Hindustan Unilever Ltd.", address: "Mumbai, Maharashtra" },
  { slug: "harpic", name: "Harpic", manufacturer: "Reckitt Benckiser (India) Pvt. Ltd.", address: "Gurugram, Haryana" },
  { slug: "lizol", name: "Lizol", manufacturer: "Reckitt Benckiser (India) Pvt. Ltd.", address: "Gurugram, Haryana" },
];

const categories: SeedCategory[] = [
  {
    slug: "fruits-vegetables",
    name: "Fruits & Vegetables",
    subcategories: [
      { slug: "fresh-fruits", name: "Fresh Fruits" },
      { slug: "fresh-vegetables", name: "Fresh Vegetables" },
    ],
    products: [
      { slug: "banana-robusta-6pc", name: "Banana Robusta", sub: "fresh-fruits", tags: ["kela"], hsnCode: "0803", gstRate: "0", isVeg: true, variants: single("banana-robusta-6pc", "pc", "6", "42.00", "50.00", 120) },
      // Limited per order, like a promotional price.
      { slug: "onion-1kg", name: "Onion", sub: "fresh-vegetables", tags: ["pyaz", "kanda"], hsnCode: "0703", gstRate: "0", isVeg: true, variants: single("onion-1kg", "kg", "1", "38.00", "45.00", 200, { maxOrderQuantity: 5 }) },
      { slug: "tomato-hybrid-500g", name: "Tomato Hybrid", sub: "fresh-vegetables", tags: ["tamatar"], hsnCode: "0702", gstRate: "0", isVeg: true, variants: single("tomato-hybrid-500g", "g", "500", "24.00", "30.00", 150) },
      { slug: "potato-1kg", name: "Potato", sub: "fresh-vegetables", tags: ["aloo"], hsnCode: "0701", gstRate: "0", isVeg: true, variants: single("potato-1kg", "kg", "1", "35.00", "40.00", 180) },
      { slug: "apple-shimla-4pc", name: "Shimla Apple", sub: "fresh-fruits", tags: ["seb"], hsnCode: "0808", gstRate: "0", isVeg: true, variants: single("apple-shimla-4pc", "pc", "4", "119.00", "140.00", 60) },
    ],
  },
  {
    slug: "dairy-breakfast",
    name: "Dairy & Breakfast",
    subcategories: [
      { slug: "milk", name: "Milk" },
      { slug: "bread-eggs", name: "Bread & Eggs" },
      { slug: "butter-cheese", name: "Butter & Cheese" },
      { slug: "breakfast-cereals", name: "Breakfast Cereals" },
    ],
    products: [
      {
        slug: "amul-taaza-milk-1l",
        name: "Amul Taaza Toned Milk",
        sub: "milk",
        brand: "amul",
        tags: ["doodh", "toned milk"],
        hsnCode: "0401",
        gstRate: "0",
        isVeg: true,
        details: { countryOfOrigin: "India", shelfLife: "2 days, refrigerated", ingredients: "Toned milk" },
        options: [{ name: "Size", values: ["500 ml", "1 L"] }],
        variants: [
          { sku: "AMUL-TAAZA-MILK-500ML", unit: "ml", quantity: "500", sellingPrice: "34.00", mrp: "34.00", stock: 120, optionValues: ["500 ml"] },
          { sku: "AMUL-TAAZA-MILK-1L", unit: "L", quantity: "1", sellingPrice: "68.00", mrp: "68.00", stock: 100, optionValues: ["1 L"] },
        ],
      },
      { slug: "amul-butter-100g", name: "Amul Salted Butter", sub: "butter-cheese", brand: "amul", tags: ["makhan"], hsnCode: "0405", gstRate: "12", isVeg: true, details: { countryOfOrigin: "India", shelfLife: "12 months, refrigerated", ingredients: "Milk fat, common salt" }, variants: single("amul-butter-100g", "g", "100", "58.00", "60.00", 80) },
      { slug: "britannia-brown-bread-400g", name: "Britannia Brown Bread", sub: "bread-eggs", brand: "britannia", hsnCode: "1905", gstRate: "0", isVeg: true, details: { countryOfOrigin: "India", shelfLife: "4 days" }, variants: single("britannia-brown-bread-400g", "g", "400", "50.00", "55.00", 40) },
      { slug: "farm-eggs-6pc", name: "Farm Fresh Eggs", sub: "bread-eggs", tags: ["anda"], hsnCode: "0407", gstRate: "0", isVeg: false, variants: single("farm-eggs-6pc", "pc", "6", "54.00", "60.00", 70) },
      { slug: "kelloggs-corn-flakes-475g", name: "Kellogg's Corn Flakes", sub: "breakfast-cereals", brand: "kelloggs", hsnCode: "1904", gstRate: "18", isVeg: true, details: { countryOfOrigin: "India", shelfLife: "9 months" }, variants: single("kelloggs-corn-flakes-475g", "g", "475", "199.00", "225.00", 35) },
    ],
  },
  {
    slug: "snacks",
    name: "Snacks",
    subcategories: [
      { slug: "chips-namkeen", name: "Chips & Namkeen" },
      { slug: "biscuits", name: "Biscuits" },
      { slug: "chocolates", name: "Chocolates" },
    ],
    products: [
      { slug: "lays-classic-salted-52g", name: "Lay's Classic Salted Chips", sub: "chips-namkeen", brand: "lays", hsnCode: "2005", gstRate: "12", isVeg: true, variants: single("lays-classic-salted-52g", "g", "52", "20.00", "20.00", 150) },
      { slug: "haldirams-aloo-bhujia-200g", name: "Haldiram's Aloo Bhujia", sub: "chips-namkeen", brand: "haldirams", tags: ["namkeen"], hsnCode: "2106", gstRate: "12", isVeg: true, variants: single("haldirams-aloo-bhujia-200g", "g", "200", "55.00", "60.00", 90) },
      { slug: "parle-g-800g", name: "Parle-G Biscuits", sub: "biscuits", brand: "parle", hsnCode: "1905", gstRate: "18", isVeg: true, variants: single("parle-g-800g", "g", "800", "90.00", "100.00", 75) },
      {
        // Two options; Fruit & Nut is not made in the large size.
        slug: "dairy-milk-silk-60g",
        name: "Cadbury Dairy Milk Silk",
        sub: "chocolates",
        brand: "cadbury",
        hsnCode: "1806",
        gstRate: "18",
        isVeg: true,
        details: { countryOfOrigin: "India", shelfLife: "12 months" },
        options: [
          { name: "Flavour", values: ["Classic", "Fruit & Nut"] },
          { name: "Size", values: ["60 g", "150 g"] },
        ],
        variants: [
          { sku: "DAIRY-MILK-SILK-60G", unit: "g", quantity: "60", sellingPrice: "85.00", mrp: "90.00", stock: 60, optionValues: ["Classic", "60 g"] },
          { sku: "DAIRY-MILK-SILK-150G", unit: "g", quantity: "150", sellingPrice: "190.00", mrp: "200.00", stock: 30, optionValues: ["Classic", "150 g"] },
          { sku: "DAIRY-MILK-SILK-FN-60G", unit: "g", quantity: "60", sellingPrice: "95.00", mrp: "100.00", stock: 40, optionValues: ["Fruit & Nut", "60 g"] },
        ],
      },
    ],
  },
  {
    slug: "beverages",
    name: "Beverages",
    subcategories: [
      { slug: "soft-drinks", name: "Soft Drinks" },
      { slug: "tea-coffee", name: "Tea & Coffee" },
      { slug: "juices", name: "Juices" },
    ],
    products: [
      {
        slug: "coca-cola-750ml",
        name: "Coca-Cola",
        sub: "soft-drinks",
        brand: "coca-cola",
        tags: ["coke", "cold drink"],
        hsnCode: "2202",
        gstRate: "28",
        isVeg: true,
        options: [{ name: "Size", values: ["750 ml", "2.25 L"] }],
        variants: [
          { sku: "COCA-COLA-750ML", unit: "ml", quantity: "750", sellingPrice: "40.00", mrp: "45.00", stock: 110, optionValues: ["750 ml"] },
          { sku: "COCA-COLA-2.25L", unit: "L", quantity: "2.25", sellingPrice: "99.00", mrp: "110.00", stock: 40, optionValues: ["2.25 L"], maxOrderQuantity: 6 },
        ],
      },
      {
        slug: "tata-tea-gold-500g",
        name: "Tata Tea Gold",
        sub: "tea-coffee",
        brand: "tata",
        tags: ["chai"],
        hsnCode: "0902",
        gstRate: "5",
        isVeg: true,
        details: { countryOfOrigin: "India", shelfLife: "12 months", ingredients: "Tea" },
        options: [{ name: "Size", values: ["250 g", "500 g", "1 kg"] }],
        variants: [
          { sku: "TATA-TEA-GOLD-250G", unit: "g", quantity: "250", sellingPrice: "150.00", mrp: "165.00", stock: 50, optionValues: ["250 g"] },
          { sku: "TATA-TEA-GOLD-500G", unit: "g", quantity: "500", sellingPrice: "285.00", mrp: "320.00", stock: 45, optionValues: ["500 g"] },
          { sku: "TATA-TEA-GOLD-1KG", unit: "kg", quantity: "1", sellingPrice: "549.00", mrp: "620.00", stock: 20, optionValues: ["1 kg"] },
        ],
      },
      { slug: "nescafe-classic-50g", name: "Nescafe Classic Coffee", sub: "tea-coffee", brand: "nescafe", hsnCode: "2101", gstRate: "18", isVeg: true, variants: single("nescafe-classic-50g", "g", "50", "175.00", "190.00", 40) },
      { slug: "real-mixed-fruit-juice-1l", name: "Real Mixed Fruit Juice", sub: "juices", brand: "real", hsnCode: "2009", gstRate: "12", isVeg: true, variants: single("real-mixed-fruit-juice-1l", "L", "1", "115.00", "130.00", 55) },
    ],
  },
  {
    slug: "staples",
    name: "Staples",
    subcategories: [
      { slug: "atta-rice", name: "Atta & Rice" },
      { slug: "dals-pulses", name: "Dals & Pulses" },
      { slug: "oil-salt", name: "Oil & Salt" },
    ],
    products: [
      {
        slug: "aashirvaad-atta-5kg",
        name: "Aashirvaad Shudh Chakki Atta",
        sub: "atta-rice",
        brand: "aashirvaad",
        tags: ["wheat flour", "gehu"],
        hsnCode: "1101",
        gstRate: "5",
        isVeg: true,
        details: { countryOfOrigin: "India", shelfLife: "3 months", ingredients: "Whole wheat" },
        options: [{ name: "Size", values: ["1 kg", "5 kg", "10 kg"] }],
        variants: [
          { sku: "AASHIRVAAD-ATTA-1KG", unit: "kg", quantity: "1", sellingPrice: "62.00", mrp: "68.00", stock: 80, optionValues: ["1 kg"] },
          { sku: "AASHIRVAAD-ATTA-5KG", unit: "kg", quantity: "5", sellingPrice: "265.00", mrp: "299.00", stock: 50, optionValues: ["5 kg"] },
          { sku: "AASHIRVAAD-ATTA-10KG", unit: "kg", quantity: "10", sellingPrice: "509.00", mrp: "580.00", stock: 15, optionValues: ["10 kg"], maxOrderQuantity: 3 },
        ],
      },
      { slug: "india-gate-basmati-1kg", name: "India Gate Basmati Rice", sub: "atta-rice", brand: "india-gate", tags: ["chawal"], hsnCode: "1006", gstRate: "5", isVeg: true, variants: single("india-gate-basmati-1kg", "kg", "1", "155.00", "180.00", 60) },
      { slug: "tata-salt-1kg", name: "Tata Salt", sub: "oil-salt", brand: "tata", tags: ["namak"], hsnCode: "2501", gstRate: "0", isVeg: true, variants: single("tata-salt-1kg", "kg", "1", "28.00", "30.00", 120) },
      { slug: "fortune-sunflower-oil-1l", name: "Fortune Sunflower Oil", sub: "oil-salt", brand: "fortune", tags: ["tel"], hsnCode: "1512", gstRate: "5", isVeg: true, variants: single("fortune-sunflower-oil-1l", "L", "1", "155.00", "175.00", 70) },
      { slug: "toor-dal-1kg", name: "Toor Dal", sub: "dals-pulses", tags: ["arhar", "tuvar"], hsnCode: "0713", gstRate: "5", isVeg: true, variants: single("toor-dal-1kg", "kg", "1", "165.00", "190.00", 65) },
    ],
  },
  {
    slug: "personal-care",
    name: "Personal Care",
    subcategories: [
      { slug: "oral-care", name: "Oral Care" },
      { slug: "bath-body", name: "Bath & Body" },
      { slug: "hair-care", name: "Hair Care" },
    ],
    products: [
      { slug: "colgate-strong-teeth-200g", name: "Colgate Strong Teeth Toothpaste", sub: "oral-care", brand: "colgate", hsnCode: "3306", gstRate: "18", variants: single("colgate-strong-teeth-200g", "g", "200", "110.00", "125.00", 50) },
      { slug: "dove-soap-3x100g", name: "Dove Cream Beauty Bar (Pack of 3)", sub: "bath-body", brand: "dove", hsnCode: "3401", gstRate: "18", variants: single("dove-soap-3x100g", "g", "300", "199.00", "225.00", 40) },
      { slug: "head-shoulders-340ml", name: "Head & Shoulders Shampoo", sub: "hair-care", brand: "head-shoulders", hsnCode: "3305", gstRate: "18", variants: single("head-shoulders-340ml", "ml", "340", "335.00", "380.00", 25) },
    ],
  },
  {
    slug: "household",
    name: "Household",
    subcategories: [
      { slug: "laundry", name: "Laundry" },
      { slug: "cleaning", name: "Cleaning" },
    ],
    products: [
      { slug: "surf-excel-easy-wash-1kg", name: "Surf Excel Easy Wash Detergent", sub: "laundry", brand: "surf-excel", hsnCode: "3402", gstRate: "18", variants: single("surf-excel-easy-wash-1kg", "kg", "1", "135.00", "150.00", 45) },
      { slug: "vim-dishwash-gel-500ml", name: "Vim Dishwash Gel", sub: "cleaning", brand: "vim", hsnCode: "3402", gstRate: "18", variants: single("vim-dishwash-gel-500ml", "ml", "500", "105.00", "115.00", 50) },
      { slug: "harpic-toilet-cleaner-500ml", name: "Harpic Toilet Cleaner", sub: "cleaning", brand: "harpic", hsnCode: "3402", gstRate: "18", variants: single("harpic-toilet-cleaner-500ml", "ml", "500", "99.00", "110.00", 40) },
      { slug: "lizol-floor-cleaner-975ml", name: "Lizol Floor Cleaner", sub: "cleaning", brand: "lizol", hsnCode: "3808", gstRate: "18", variants: single("lizol-floor-cleaner-975ml", "ml", "975", "199.00", "229.00", 30) },
    ],
  },
];

async function main() {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to run the development seed with NODE_ENV=production");
  }

  for (const user of users) {
    await prisma.user.upsert({
      where: { phone: user.phone },
      update: { name: user.name, email: user.email, role: user.role },
      create: user,
    });
  }

  const { code, ...storeData } = store;
  const seededStore = await prisma.store.upsert({
    where: { code },
    update: storeData,
    create: store,
  });

  await prisma.user.upsert({
    where: { phone: storeStaff.phone },
    update: { name: storeStaff.name, email: storeStaff.email, role: UserRole.STORE_STAFF, storeId: seededStore.id },
    create: { ...storeStaff, role: UserRole.STORE_STAFF, storeId: seededStore.id },
  });

  // Only where none is set, so a password changed while testing survives a reseed.
  await prisma.user.updateMany({
    where: { phone: { in: [users[0]!.phone, storeStaff.phone] }, passwordHash: null },
    data: { passwordHash: await hashPassword(DEV_PASSWORD) },
  });

  const brandIds = new Map<string, string>();
  for (const { slug, name } of brands) {
    const seededBrand = await prisma.brand.upsert({ where: { slug }, update: { name }, create: { slug, name } });
    brandIds.set(slug, seededBrand.id);
  }
  const brandDetails = new Map(brands.map((brand) => [brand.slug, brand]));

  let productCount = 0;
  let variantCount = 0;

  for (const [index, category] of categories.entries()) {
    const seededCategory = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, sortOrder: index, parentId: null },
      create: { slug: category.slug, name: category.name, sortOrder: index },
    });

    const subcategoryIds = new Map<string, string>();
    for (const [subIndex, sub] of category.subcategories.entries()) {
      const seededSub = await prisma.category.upsert({
        where: { slug: sub.slug },
        update: { name: sub.name, sortOrder: subIndex, parentId: seededCategory.id },
        create: { slug: sub.slug, name: sub.name, sortOrder: subIndex, parentId: seededCategory.id },
      });
      subcategoryIds.set(sub.slug, seededSub.id);
    }

    for (const { slug, sub, brand, details, options, variants, ...product } of category.products) {
      const maker = brand ? brandDetails.get(brand) : undefined;
      const data = {
        ...product,
        ...details,
        categoryId: subcategoryIds.get(sub)!,
        brandId: brand ? brandIds.get(brand)! : null,
        manufacturerName: maker?.manufacturer ?? null,
        manufacturerAddress: maker?.address ?? null,
      };
      const seededProduct = await prisma.product.upsert({ where: { slug }, update: data, create: { ...data, slug } });

      // Existing variants are matched by SKU so a reseed updates them instead of adding new ones.
      const existing = await prisma.productVariant.findMany({
        where: { sku: { in: variants.map((variant) => variant.sku) } },
        select: { id: true, sku: true },
      });
      const idBySku = new Map(existing.map((variant) => [variant.sku, variant.id]));

      await prisma.$transaction((tx) =>
        saveVariants(tx, seededProduct.id, {
          options: options ?? [],
          variants: variants.map((variant) => ({
            id: idBySku.get(variant.sku),
            sku: variant.sku,
            unit: variant.unit,
            quantity: variant.quantity,
            maxOrderQuantity: variant.maxOrderQuantity ?? null,
            optionValues: variant.optionValues ?? [],
          })),
        }),
      );

      for (const variant of variants) {
        const { id: variantId } = await prisma.productVariant.findUniqueOrThrow({ where: { sku: variant.sku }, select: { id: true } });
        const storeProduct = await prisma.storeProduct.upsert({
          where: { storeId_variantId: { storeId: seededStore.id, variantId } },
          update: { sellingPrice: variant.sellingPrice, mrp: variant.mrp },
          create: { storeId: seededStore.id, variantId, sellingPrice: variant.sellingPrice, mrp: variant.mrp },
        });

        // Stock is only set on first insert so re-seeding doesn't wipe stock changed during testing.
        await prisma.inventory.upsert({
          where: { storeProductId: storeProduct.id },
          update: {},
          create: { storeProductId: storeProduct.id, quantity: variant.stock },
        });

        variantCount++;
      }

      productCount++;
    }
  }

  console.log(
    `Seeded ${users.length + 1} users (incl. store staff), 1 store, ${brands.length} brands, ${categories.length} categories with sub-categories, ${productCount} products with ${variantCount} variants`,
  );
  console.log(`Dashboard sign-in: ${users[0]!.email} or ${storeStaff.email}, password "${DEV_PASSWORD}"`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
