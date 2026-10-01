import { UserRole } from "../../generated/prisma/client";

import { env } from "../../config/env.js";
import { prisma } from "./prisma.js";

type SeedProduct = {
  slug: string;
  name: string;
  unit: string;
  quantity: string;
  sellingPrice: string;
  mrp: string;
  stock: number;
};

type SeedCategory = {
  slug: string;
  name: string;
  products: SeedProduct[];
};

const users = [
  { phone: "+919000000001", name: "Platform Admin", role: UserRole.ADMIN },
  { phone: "+919000000002", name: "Test Customer", role: UserRole.CUSTOMER },
];

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
};

const categories: SeedCategory[] = [
  {
    slug: "fruits-vegetables",
    name: "Fruits & Vegetables",
    products: [
      { slug: "banana-robusta-6pc", name: "Banana Robusta", unit: "pc", quantity: "6", sellingPrice: "42.00", mrp: "50.00", stock: 120 },
      { slug: "onion-1kg", name: "Onion", unit: "kg", quantity: "1", sellingPrice: "38.00", mrp: "45.00", stock: 200 },
      { slug: "tomato-hybrid-500g", name: "Tomato Hybrid", unit: "g", quantity: "500", sellingPrice: "24.00", mrp: "30.00", stock: 150 },
      { slug: "potato-1kg", name: "Potato", unit: "kg", quantity: "1", sellingPrice: "35.00", mrp: "40.00", stock: 180 },
      { slug: "apple-shimla-4pc", name: "Shimla Apple", unit: "pc", quantity: "4", sellingPrice: "119.00", mrp: "140.00", stock: 60 },
    ],
  },
  {
    slug: "dairy-breakfast",
    name: "Dairy & Breakfast",
    products: [
      { slug: "amul-taaza-milk-1l", name: "Amul Taaza Toned Milk", unit: "L", quantity: "1", sellingPrice: "68.00", mrp: "68.00", stock: 100 },
      { slug: "amul-butter-100g", name: "Amul Salted Butter", unit: "g", quantity: "100", sellingPrice: "58.00", mrp: "60.00", stock: 80 },
      { slug: "britannia-brown-bread-400g", name: "Britannia Brown Bread", unit: "g", quantity: "400", sellingPrice: "50.00", mrp: "55.00", stock: 40 },
      { slug: "farm-eggs-6pc", name: "Farm Fresh Eggs", unit: "pc", quantity: "6", sellingPrice: "54.00", mrp: "60.00", stock: 70 },
      { slug: "kelloggs-corn-flakes-475g", name: "Kellogg's Corn Flakes", unit: "g", quantity: "475", sellingPrice: "199.00", mrp: "225.00", stock: 35 },
    ],
  },
  {
    slug: "snacks",
    name: "Snacks",
    products: [
      { slug: "lays-classic-salted-52g", name: "Lay's Classic Salted Chips", unit: "g", quantity: "52", sellingPrice: "20.00", mrp: "20.00", stock: 150 },
      { slug: "haldirams-aloo-bhujia-200g", name: "Haldiram's Aloo Bhujia", unit: "g", quantity: "200", sellingPrice: "55.00", mrp: "60.00", stock: 90 },
      { slug: "parle-g-800g", name: "Parle-G Biscuits", unit: "g", quantity: "800", sellingPrice: "90.00", mrp: "100.00", stock: 75 },
      { slug: "dairy-milk-silk-60g", name: "Cadbury Dairy Milk Silk", unit: "g", quantity: "60", sellingPrice: "85.00", mrp: "90.00", stock: 60 },
    ],
  },
  {
    slug: "beverages",
    name: "Beverages",
    products: [
      { slug: "coca-cola-750ml", name: "Coca-Cola", unit: "ml", quantity: "750", sellingPrice: "40.00", mrp: "45.00", stock: 110 },
      { slug: "tata-tea-gold-500g", name: "Tata Tea Gold", unit: "g", quantity: "500", sellingPrice: "285.00", mrp: "320.00", stock: 45 },
      { slug: "nescafe-classic-50g", name: "Nescafe Classic Coffee", unit: "g", quantity: "50", sellingPrice: "175.00", mrp: "190.00", stock: 40 },
      { slug: "real-mixed-fruit-juice-1l", name: "Real Mixed Fruit Juice", unit: "L", quantity: "1", sellingPrice: "115.00", mrp: "130.00", stock: 55 },
    ],
  },
  {
    slug: "staples",
    name: "Staples",
    products: [
      { slug: "aashirvaad-atta-5kg", name: "Aashirvaad Shudh Chakki Atta", unit: "kg", quantity: "5", sellingPrice: "265.00", mrp: "299.00", stock: 50 },
      { slug: "india-gate-basmati-1kg", name: "India Gate Basmati Rice", unit: "kg", quantity: "1", sellingPrice: "155.00", mrp: "180.00", stock: 60 },
      { slug: "tata-salt-1kg", name: "Tata Salt", unit: "kg", quantity: "1", sellingPrice: "28.00", mrp: "30.00", stock: 120 },
      { slug: "fortune-sunflower-oil-1l", name: "Fortune Sunflower Oil", unit: "L", quantity: "1", sellingPrice: "155.00", mrp: "175.00", stock: 70 },
      { slug: "toor-dal-1kg", name: "Toor Dal", unit: "kg", quantity: "1", sellingPrice: "165.00", mrp: "190.00", stock: 65 },
    ],
  },
  {
    slug: "personal-care",
    name: "Personal Care",
    products: [
      { slug: "colgate-strong-teeth-200g", name: "Colgate Strong Teeth Toothpaste", unit: "g", quantity: "200", sellingPrice: "110.00", mrp: "125.00", stock: 50 },
      { slug: "dove-soap-3x100g", name: "Dove Cream Beauty Bar (Pack of 3)", unit: "g", quantity: "300", sellingPrice: "199.00", mrp: "225.00", stock: 40 },
      { slug: "head-shoulders-340ml", name: "Head & Shoulders Shampoo", unit: "ml", quantity: "340", sellingPrice: "335.00", mrp: "380.00", stock: 25 },
    ],
  },
  {
    slug: "household",
    name: "Household",
    products: [
      { slug: "surf-excel-easy-wash-1kg", name: "Surf Excel Easy Wash Detergent", unit: "kg", quantity: "1", sellingPrice: "135.00", mrp: "150.00", stock: 45 },
      { slug: "vim-dishwash-gel-500ml", name: "Vim Dishwash Gel", unit: "ml", quantity: "500", sellingPrice: "105.00", mrp: "115.00", stock: 50 },
      { slug: "harpic-toilet-cleaner-500ml", name: "Harpic Toilet Cleaner", unit: "ml", quantity: "500", sellingPrice: "99.00", mrp: "110.00", stock: 40 },
      { slug: "lizol-floor-cleaner-975ml", name: "Lizol Floor Cleaner", unit: "ml", quantity: "975", sellingPrice: "199.00", mrp: "229.00", stock: 30 },
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
      update: { name: user.name, role: user.role },
      create: user,
    });
  }

  const { code, ...storeData } = store;
  const seededStore = await prisma.store.upsert({
    where: { code },
    update: storeData,
    create: store,
  });

  let productCount = 0;

  for (const [index, category] of categories.entries()) {
    const seededCategory = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, sortOrder: index },
      create: { slug: category.slug, name: category.name, sortOrder: index },
    });

    for (const { sellingPrice, mrp, stock, ...product } of category.products) {
      const seededProduct = await prisma.product.upsert({
        where: { slug: product.slug },
        update: { ...product, categoryId: seededCategory.id },
        create: { ...product, categoryId: seededCategory.id },
      });

      const storeProduct = await prisma.storeProduct.upsert({
        where: {
          storeId_productId: {
            storeId: seededStore.id,
            productId: seededProduct.id,
          },
        },
        update: { sellingPrice, mrp },
        create: {
          storeId: seededStore.id,
          productId: seededProduct.id,
          sellingPrice,
          mrp,
        },
      });

      // Stock is only set on first insert so re-seeding doesn't wipe stock changed during testing.
      await prisma.inventory.upsert({
        where: { storeProductId: storeProduct.id },
        update: {},
        create: { storeProductId: storeProduct.id, quantity: stock },
      });

      productCount++;
    }
  }

  console.log(
    `Seeded ${users.length} users, 1 store, ${categories.length} categories, ${productCount} products`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
