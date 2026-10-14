import { UserRole } from "../../generated/prisma/client";

import { env } from "../../config/env.js";
import { saveVariants } from "../../modules/products/variants.js";
import { hashPassword } from "../../shared/password.js";
import { prisma } from "./prisma.js";

type SeedVariant = {
  sku: string;
  price: string;
  compareAtPrice?: string;
  stock: number;
  weightGrams: number;
  /** Length, breadth and height of the packed item in cm. */
  dimensions?: [string, string, string];
  unit?: string;
  quantity?: string;
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
  description?: string;
  tags?: string[];
  hsnCode: string;
  gstRate: string;
  countryOfOrigin?: string;
  specifications?: { name: string; value: string }[];
  options?: { name: string; values: string[] }[];
  variants: SeedVariant[];
};

type SeedCategory = {
  slug: string;
  name: string;
  subcategories: { slug: string; name: string }[];
  products: SeedProduct[];
};

// Development only; the seed refuses to run in production.
const DEV_PASSWORD = "shop-dev";

const users = [
  { phone: "+919000000001", name: "Shop Admin", email: "admin@shop.test", role: UserRole.ADMIN },
  { phone: "+919000000002", name: "Test Customer", email: null, role: UserRole.CUSTOMER },
  { phone: "+919000000003", name: "Shop Staff", email: "staff@shop.test", role: UserRole.STAFF },
];

const pickupLocation = {
  name: "Main warehouse",
  contactName: "Shop Staff",
  phone: "+918000000001",
  email: "warehouse@shop.test",
  addressLine1: "80 Feet Road, 4th Block",
  addressLine2: "Koramangala",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560034",
};

// HSN codes and GST rates are typical values for these goods, for development data only.
const brands = [
  { slug: "everyday-basics", name: "Everyday Basics", manufacturer: "Everyday Basics Apparel Pvt. Ltd.", address: "Tiruppur, Tamil Nadu 641604" },
  { slug: "homeware-co", name: "Homeware Co", manufacturer: "Homeware Co Pvt. Ltd.", address: "Khurja, Uttar Pradesh 203131" },
  { slug: "trailpack", name: "Trailpack", manufacturer: "Trailpack Gear LLP", address: "Bhiwandi, Maharashtra 421302" },
];

const categories: SeedCategory[] = [
  {
    slug: "clothing",
    name: "Clothing",
    subcategories: [
      { slug: "t-shirts", name: "T-Shirts" },
      { slug: "hoodies", name: "Hoodies" },
    ],
    products: [
      {
        slug: "classic-cotton-t-shirt",
        name: "Classic Cotton T-Shirt",
        sub: "t-shirts",
        brand: "everyday-basics",
        description: "Soft crew-neck T-shirt in 100% combed cotton.",
        tags: ["t-shirt", "cotton", "tee"],
        hsnCode: "6109",
        gstRate: "5",
        countryOfOrigin: "India",
        specifications: [
          { name: "Material", value: "100% cotton" },
          { name: "Fit", value: "Regular" },
          { name: "Care", value: "Machine wash cold" },
        ],
        options: [
          { name: "Size", values: ["S", "M", "L"] },
          { name: "Colour", values: ["Black", "White"] },
        ],
        variants: [
          { sku: "TSHIRT-S-BLK", price: "499.00", compareAtPrice: "699.00", stock: 20, weightGrams: 180, dimensions: ["30", "25", "3"], optionValues: ["S", "Black"] },
          { sku: "TSHIRT-M-BLK", price: "499.00", compareAtPrice: "699.00", stock: 30, weightGrams: 200, dimensions: ["30", "25", "3"], optionValues: ["M", "Black"] },
          { sku: "TSHIRT-L-BLK", price: "499.00", compareAtPrice: "699.00", stock: 25, weightGrams: 220, dimensions: ["32", "26", "3"], optionValues: ["L", "Black"] },
          { sku: "TSHIRT-M-WHT", price: "449.00", stock: 15, weightGrams: 200, dimensions: ["30", "25", "3"], optionValues: ["M", "White"] },
          // White L is out of stock, to try the sold-out state.
          { sku: "TSHIRT-L-WHT", price: "449.00", stock: 0, weightGrams: 220, dimensions: ["32", "26", "3"], optionValues: ["L", "White"] },
        ],
      },
      {
        slug: "fleece-hoodie",
        name: "Fleece Pullover Hoodie",
        sub: "hoodies",
        brand: "everyday-basics",
        description: "Warm brushed-fleece hoodie with a kangaroo pocket.",
        tags: ["hoodie", "sweatshirt"],
        hsnCode: "6110",
        gstRate: "12",
        countryOfOrigin: "India",
        specifications: [{ name: "Material", value: "80% cotton, 20% polyester" }],
        options: [{ name: "Size", values: ["M", "L", "XL"] }],
        variants: [
          { sku: "HOODIE-M", price: "1299.00", compareAtPrice: "1599.00", stock: 10, weightGrams: 550, dimensions: ["35", "30", "6"], optionValues: ["M"], maxOrderQuantity: 3 },
          { sku: "HOODIE-L", price: "1299.00", compareAtPrice: "1599.00", stock: 12, weightGrams: 600, dimensions: ["35", "30", "6"], optionValues: ["L"], maxOrderQuantity: 3 },
          { sku: "HOODIE-XL", price: "1349.00", stock: 6, weightGrams: 650, dimensions: ["36", "31", "6"], optionValues: ["XL"], maxOrderQuantity: 3 },
        ],
      },
    ],
  },
  {
    slug: "home-kitchen",
    name: "Home & Kitchen",
    subcategories: [
      { slug: "mugs", name: "Mugs" },
      { slug: "bottles", name: "Bottles" },
    ],
    products: [
      {
        slug: "ceramic-coffee-mug",
        name: "Ceramic Coffee Mug",
        sub: "mugs",
        brand: "homeware-co",
        description: "Stoneware mug, microwave and dishwasher safe.",
        tags: ["mug", "coffee"],
        hsnCode: "6912",
        gstRate: "12",
        countryOfOrigin: "India",
        specifications: [{ name: "Material", value: "Stoneware" }],
        variants: [{ sku: "MUG-350", price: "299.00", stock: 40, weightGrams: 400, dimensions: ["12", "9", "10"], unit: "ml", quantity: "350" }],
      },
      {
        slug: "steel-water-bottle",
        name: "Insulated Steel Water Bottle",
        sub: "bottles",
        brand: "homeware-co",
        description: "Double-wall stainless steel; keeps drinks cold for 24 hours.",
        tags: ["bottle", "flask"],
        hsnCode: "7323",
        gstRate: "18",
        options: [{ name: "Size", values: ["500 ml", "1 L"] }],
        variants: [
          { sku: "BOTTLE-500ML", price: "699.00", compareAtPrice: "899.00", stock: 25, weightGrams: 350, dimensions: ["7", "7", "25"], unit: "ml", quantity: "500", optionValues: ["500 ml"] },
          { sku: "BOTTLE-1L", price: "999.00", stock: 15, weightGrams: 520, dimensions: ["9", "9", "30"], unit: "L", quantity: "1", optionValues: ["1 L"] },
        ],
      },
    ],
  },
  {
    slug: "bags",
    name: "Bags",
    subcategories: [{ slug: "backpacks", name: "Backpacks" }],
    products: [
      {
        slug: "everyday-backpack",
        name: "Everyday Backpack 20 L",
        sub: "backpacks",
        brand: "trailpack",
        description: "Water-resistant backpack with a padded laptop sleeve.",
        tags: ["backpack", "bag"],
        hsnCode: "4202",
        gstRate: "18",
        countryOfOrigin: "India",
        specifications: [
          { name: "Capacity", value: "20 L" },
          { name: "Laptop sleeve", value: "Up to 15.6 inch" },
        ],
        options: [{ name: "Colour", values: ["Navy", "Grey"] }],
        variants: [
          { sku: "BACKPACK-NAVY", price: "1499.00", compareAtPrice: "1999.00", stock: 8, weightGrams: 750, dimensions: ["45", "30", "15"], optionValues: ["Navy"] },
          { sku: "BACKPACK-GREY", price: "1499.00", compareAtPrice: "1999.00", stock: 5, weightGrams: 750, dimensions: ["45", "30", "15"], optionValues: ["Grey"] },
        ],
      },
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

  // Only where none is set, so a password changed while testing survives a reseed.
  await prisma.user.updateMany({
    where: { email: { in: ["admin@shop.test", "staff@shop.test"] }, passwordHash: null },
    data: { passwordHash: await hashPassword(DEV_PASSWORD) },
  });

  const hasDefault = (await prisma.pickupLocation.count({ where: { isDefault: true } })) > 0;
  await prisma.pickupLocation.upsert({
    where: { name: pickupLocation.name },
    update: pickupLocation,
    create: { ...pickupLocation, isDefault: !hasDefault },
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

    for (const { slug, sub, brand, options, variants, ...product } of category.products) {
      const maker = brand ? brandDetails.get(brand) : undefined;
      const data = {
        ...product,
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
            unit: variant.unit ?? null,
            quantity: variant.quantity ?? null,
            price: variant.price,
            compareAtPrice: variant.compareAtPrice ?? null,
            weightGrams: variant.weightGrams,
            lengthCm: variant.dimensions?.[0] ?? null,
            breadthCm: variant.dimensions?.[1] ?? null,
            heightCm: variant.dimensions?.[2] ?? null,
            maxOrderQuantity: variant.maxOrderQuantity ?? null,
            optionValues: variant.optionValues ?? [],
          })),
        }),
      );

      // Stock is only set for new variants so re-seeding doesn't wipe stock changed during testing.
      for (const variant of variants.filter((candidate) => !idBySku.has(candidate.sku))) {
        await prisma.inventory.updateMany({ where: { variant: { sku: variant.sku } }, data: { quantity: variant.stock } });
      }

      variantCount += variants.length;
      productCount++;
    }
  }

  console.log(
    `Seeded ${users.length} users, 1 pickup location, ${brands.length} brands, ${categories.length} categories with sub-categories, ${productCount} products with ${variantCount} variants`,
  );
  console.log(`Dashboard sign-in: admin@shop.test or staff@shop.test, password "${DEV_PASSWORD}"`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
