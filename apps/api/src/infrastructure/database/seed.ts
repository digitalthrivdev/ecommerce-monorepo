import { UserRole } from "../../generated/prisma/client";

import { env } from "../../config/env.js";
import { saveVariants } from "../../modules/products/variants.js";
import { appearanceSchema } from "../../modules/settings/appearance.schemas.js";
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
  images?: string[];
  variants: SeedVariant[];
};

type SeedCategory = {
  slug: string;
  name: string;
  imageUrl?: string;
  subcategories: { slug: string; name: string; imageUrl?: string }[];
  products: SeedProduct[];
};

type SeedBrand = {
  slug: string;
  name: string;
  logoUrl?: string;
  manufacturer: string;
  address: string;
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

const brands: SeedBrand[] = [
  {
    slug: "aura-audio",
    name: "Aura Audio",
    logoUrl: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=200&auto=format&fit=crop&q=80",
    manufacturer: "Aura Acoustics Labs Inc.",
    address: "Plot 42, Electronic City Phase 1, Bengaluru, Karnataka 560100",
  },
  {
    slug: "zenith-wear",
    name: "Zenith Wear",
    logoUrl: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=200&auto=format&fit=crop&q=80",
    manufacturer: "Zenith Apparel Co.",
    address: "Tiruppur Textile Park, Tamil Nadu 641652",
  },
  {
    slug: "trailpack-gear",
    name: "Trailpack Gear",
    logoUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=200&auto=format&fit=crop&q=80",
    manufacturer: "Trailpack Outfitters LLP",
    address: "MIDC Industrial Area, Bhiwandi, Maharashtra 421302",
  },
  {
    slug: "nordic-home",
    name: "Nordic Home",
    logoUrl: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=200&auto=format&fit=crop&q=80",
    manufacturer: "Nordic Living Craft Works",
    address: "Udyog Vihar Phase 4, Gurugram, Haryana 122016",
  },
  {
    slug: "botanica-lab",
    name: "Botanica Lab",
    logoUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=200&auto=format&fit=crop&q=80",
    manufacturer: "Botanica Organics India Pvt. Ltd.",
    address: "Dehradun Pharma City, Selaqui, Uttarakhand 248011",
  },
];

const categories: SeedCategory[] = [
  {
    slug: "electronics",
    name: "Electronics",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80",
    subcategories: [
      { slug: "audio", name: "Audio & Headphones", imageUrl: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=800&auto=format&fit=crop&q=80" },
      { slug: "wearables", name: "Smartwatches", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80" },
      { slug: "accessories", name: "Desk & Phone Gear", imageUrl: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&auto=format&fit=crop&q=80" },
    ],
    products: [
      {
        slug: "aura-anc-wireless-headphones",
        name: "Aura Studio Wireless ANC Headphones",
        sub: "audio",
        brand: "aura-audio",
        description: "Studio-grade active noise cancellation over-ear headphones with custom 40mm drivers, plush memory foam earcups, and up to 35 hours of battery life on a single charge.",
        tags: ["headphones", "wireless", "audio", "anc", "bluetooth", "aura"],
        hsnCode: "8518",
        gstRate: "18",
        countryOfOrigin: "India",
        specifications: [
          { name: "Driver Size", value: "40mm Dynamic" },
          { name: "Battery Life", value: "35 Hours (ANC On)" },
          { name: "Connectivity", value: "Bluetooth 5.3 & 3.5mm Aux" },
          { name: "Charging", value: "USB-C Fast Charging (10m for 5h)" },
          { name: "Warranty", value: "1 Year Replacement" },
        ],
        options: [{ name: "Colour", values: ["Matte Black", "Silver Mist", "Midnight Navy"] }],
        images: [
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80",
          "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "AURA-ANC-BLK", price: "4999.00", compareAtPrice: "7999.00", stock: 25, weightGrams: 280, dimensions: ["22", "18", "8"], optionValues: ["Matte Black"] },
          { sku: "AURA-ANC-SLV", price: "4999.00", compareAtPrice: "7999.00", stock: 20, weightGrams: 280, dimensions: ["22", "18", "8"], optionValues: ["Silver Mist"] },
          { sku: "AURA-ANC-BLU", price: "5299.00", compareAtPrice: "7999.00", stock: 15, weightGrams: 280, dimensions: ["22", "18", "8"], optionValues: ["Midnight Navy"] },
        ],
      },
      {
        slug: "aura-tws-earbuds-pro",
        name: "Aura True Wireless Earbuds Pro",
        sub: "audio",
        brand: "aura-audio",
        description: "Compact wireless in-ear earbuds with spatial audio, quad-mic ENC for crystal-clear calls, IPX5 sweat resistance, and wireless charging case.",
        tags: ["earbuds", "tws", "wireless", "audio", "airpods", "aura"],
        hsnCode: "8518",
        gstRate: "18",
        countryOfOrigin: "India",
        specifications: [
          { name: "Water Resistance", value: "IPX5" },
          { name: "Playtime", value: "28 Hours Total with Case" },
          { name: "Microphones", value: "4-Mic ENC Beamforming" },
          { name: "Wireless Charging", value: "Qi Compatible" },
        ],
        options: [{ name: "Colour", values: ["Carbon Black", "Ivory White"] }],
        images: [
          "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "AURA-TWS-BLK", price: "2499.00", compareAtPrice: "3999.00", stock: 35, weightGrams: 55, dimensions: ["6", "5", "3"], optionValues: ["Carbon Black"] },
          { sku: "AURA-TWS-WHT", price: "2499.00", compareAtPrice: "3999.00", stock: 30, weightGrams: 55, dimensions: ["6", "5", "3"], optionValues: ["Ivory White"] },
        ],
      },
      {
        slug: "zenith-apex-smartwatch",
        name: "Zenith Apex AMOLED Smartwatch",
        sub: "wearables",
        brand: "aura-audio",
        description: "1.43-inch vivid AMOLED display with continuous heart rate, blood oxygen (SpO2), 100+ sports modes, and up to 12 days of battery life.",
        tags: ["smartwatch", "fitness", "watch", "wearable", "tracker"],
        hsnCode: "8517",
        gstRate: "18",
        countryOfOrigin: "India",
        specifications: [
          { name: "Display", value: "1.43 inch AMOLED 466x466" },
          { name: "Battery Life", value: "Up to 12 Days" },
          { name: "Water Resistance", value: "5 ATM (50m Swimproof)" },
          { name: "Sensors", value: "Heart Rate, SpO2, Accelerometer" },
        ],
        options: [{ name: "Strap", values: ["Silicone Black", "Olive Green", "Tan Leather"] }],
        images: [
          "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80",
          "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "ZEN-WATCH-BLK", price: "3499.00", compareAtPrice: "5499.00", stock: 20, weightGrams: 52, dimensions: ["10", "10", "6"], optionValues: ["Silicone Black"] },
          { sku: "ZEN-WATCH-GRN", price: "3499.00", compareAtPrice: "5499.00", stock: 15, weightGrams: 52, dimensions: ["10", "10", "6"], optionValues: ["Olive Green"] },
          { sku: "ZEN-WATCH-TAN", price: "3899.00", compareAtPrice: "5999.00", stock: 12, weightGrams: 58, dimensions: ["10", "10", "6"], optionValues: ["Tan Leather"] },
        ],
      },
      {
        slug: "ergonomic-aluminum-laptop-stand",
        name: "Ergonomic Aluminum Laptop Stand",
        sub: "accessories",
        brand: "nordic-home",
        description: "Foldable aerospace-grade aluminum stand with 6 adjustable height angles, anti-slip silicone cushions, and open airflow ventilation.",
        tags: ["laptop stand", "desk", "accessories", "aluminum", "workspace"],
        hsnCode: "8473",
        gstRate: "18",
        countryOfOrigin: "India",
        specifications: [
          { name: "Material", value: "Anodized Aluminium Alloy" },
          { name: "Compatibility", value: "10 to 16 inch laptops" },
          { name: "Height Angles", value: "6 adjustable levels (15 to 45 deg)" },
          { name: "Max Load", value: "Up to 10 kg" },
        ],
        images: [
          "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "STAND-ALUM-SLV", price: "1199.00", compareAtPrice: "1899.00", stock: 40, weightGrams: 340, dimensions: ["26", "6", "3"] },
        ],
      },
    ],
  },
  {
    slug: "fashion",
    name: "Fashion & Apparel",
    imageUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&auto=format&fit=crop&q=80",
    subcategories: [
      { slug: "mens-wear", name: "Men's Apparel", imageUrl: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80" },
      { slug: "womens-wear", name: "Women's Apparel", imageUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&auto=format&fit=crop&q=80" },
      { slug: "footwear", name: "Footwear", imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&auto=format&fit=crop&q=80" },
    ],
    products: [
      {
        slug: "heavyweight-cotton-tee",
        name: "Classic Heavyweight Cotton T-Shirt",
        sub: "mens-wear",
        brand: "zenith-wear",
        description: "Structured 240 GSM combed organic cotton t-shirt with relaxed boxy drape, taped neck, and reinforced twin-needle hems.",
        tags: ["tshirt", "cotton", "tee", "oversized", "heavyweight", "apparel"],
        hsnCode: "6109",
        gstRate: "5",
        countryOfOrigin: "India",
        specifications: [
          { name: "Fabric", value: "100% Combed Organic Cotton (240 GSM)" },
          { name: "Fit", value: "Relaxed Boxy" },
          { name: "Care", value: "Machine wash cold inside out" },
        ],
        options: [
          { name: "Size", values: ["S", "M", "L", "XL"] },
          { name: "Colour", values: ["Pitch Black", "Vintage White", "Earthy Olive"] },
        ],
        images: [
          "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "TEE-S-BLK", price: "799.00", compareAtPrice: "1299.00", stock: 20, weightGrams: 220, dimensions: ["30", "25", "3"], optionValues: ["S", "Pitch Black"] },
          { sku: "TEE-M-BLK", price: "799.00", compareAtPrice: "1299.00", stock: 30, weightGrams: 240, dimensions: ["30", "25", "3"], optionValues: ["M", "Pitch Black"] },
          { sku: "TEE-L-BLK", price: "799.00", compareAtPrice: "1299.00", stock: 25, weightGrams: 260, dimensions: ["30", "25", "3"], optionValues: ["L", "Pitch Black"] },
          { sku: "TEE-XL-BLK", price: "849.00", compareAtPrice: "1299.00", stock: 15, weightGrams: 280, dimensions: ["32", "26", "3"], optionValues: ["XL", "Pitch Black"] },
          { sku: "TEE-S-WHT", price: "799.00", compareAtPrice: "1299.00", stock: 20, weightGrams: 220, dimensions: ["30", "25", "3"], optionValues: ["S", "Vintage White"] },
          { sku: "TEE-M-WHT", price: "799.00", compareAtPrice: "1299.00", stock: 20, weightGrams: 240, dimensions: ["30", "25", "3"], optionValues: ["M", "Vintage White"] },
          { sku: "TEE-L-WHT", price: "799.00", compareAtPrice: "1299.00", stock: 18, weightGrams: 260, dimensions: ["30", "25", "3"], optionValues: ["L", "Vintage White"] },
          { sku: "TEE-XL-WHT", price: "849.00", compareAtPrice: "1299.00", stock: 15, weightGrams: 280, dimensions: ["32", "26", "3"], optionValues: ["XL", "Vintage White"] },
          { sku: "TEE-S-OLV", price: "799.00", compareAtPrice: "1299.00", stock: 20, weightGrams: 220, dimensions: ["30", "25", "3"], optionValues: ["S", "Earthy Olive"] },
          { sku: "TEE-M-OLV", price: "799.00", compareAtPrice: "1299.00", stock: 15, weightGrams: 240, dimensions: ["30", "25", "3"], optionValues: ["M", "Earthy Olive"] },
          { sku: "TEE-L-OLV", price: "799.00", compareAtPrice: "1299.00", stock: 12, weightGrams: 260, dimensions: ["30", "25", "3"], optionValues: ["L", "Earthy Olive"] },
          { sku: "TEE-XL-OLV", price: "849.00", compareAtPrice: "1299.00", stock: 15, weightGrams: 280, dimensions: ["32", "26", "3"], optionValues: ["XL", "Earthy Olive"] },
        ],
      },
      {
        slug: "cosy-fleece-pullover-hoodie",
        name: "Cozy Brushed Fleece Pullover Hoodie",
        sub: "mens-wear",
        brand: "zenith-wear",
        description: "Heavy 360 GSM cotton-poly fleece pullover with plush brushed interior, double-lined hood, and deep kangaroo pocket.",
        tags: ["hoodie", "sweatshirt", "fleece", "pullover", "winter"],
        hsnCode: "6110",
        gstRate: "12",
        countryOfOrigin: "India",
        specifications: [
          { name: "Fabric", value: "80% Cotton, 20% Polyester (360 GSM)" },
          { name: "Pocket", value: "Front Kangaroo Pocket" },
          { name: "Hood", value: "Double layer with drawstrings" },
        ],
        options: [
          { name: "Size", values: ["M", "L", "XL"] },
          { name: "Colour", values: ["Heather Grey", "Onyx Black"] },
        ],
        images: [
          "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "HOOD-M-GRY", price: "1699.00", compareAtPrice: "2499.00", stock: 18, weightGrams: 580, dimensions: ["35", "30", "6"], optionValues: ["M", "Heather Grey"] },
          { sku: "HOOD-L-GRY", price: "1699.00", compareAtPrice: "2499.00", stock: 20, weightGrams: 620, dimensions: ["35", "30", "6"], optionValues: ["L", "Heather Grey"] },
          { sku: "HOOD-XL-GRY", price: "1799.00", compareAtPrice: "2499.00", stock: 10, weightGrams: 660, dimensions: ["36", "31", "6"], optionValues: ["XL", "Heather Grey"] },
          { sku: "HOOD-M-BLK", price: "1699.00", compareAtPrice: "2499.00", stock: 22, weightGrams: 580, dimensions: ["35", "30", "6"], optionValues: ["M", "Onyx Black"] },
          { sku: "HOOD-L-BLK", price: "1699.00", compareAtPrice: "2499.00", stock: 15, weightGrams: 620, dimensions: ["35", "30", "6"], optionValues: ["L", "Onyx Black"] },
          { sku: "HOOD-XL-BLK", price: "1799.00", compareAtPrice: "2499.00", stock: 15, weightGrams: 660, dimensions: ["36", "31", "6"], optionValues: ["XL", "Onyx Black"] },
        ],
      },
      {
        slug: "retro-court-sneakers",
        name: "Retro Court Minimalist Leather Sneakers",
        sub: "footwear",
        brand: "zenith-wear",
        description: "Handcrafted low-top sneakers in supple microfiber vegan leather with ergonomic memory foam insole and durable vulcanized gum sole.",
        tags: ["sneakers", "shoes", "footwear", "white sneakers", "retro"],
        hsnCode: "6402",
        gstRate: "12",
        countryOfOrigin: "India",
        specifications: [
          { name: "Upper Material", value: "Water-resistant Vegan Leather" },
          { name: "Insole", value: "Breathable Memory Foam Cushion" },
          { name: "Sole", value: "Vulcanized Anti-Skid Rubber" },
        ],
        options: [{ name: "Size", values: ["UK 7", "UK 8", "UK 9", "UK 10"] }],
        images: [
          "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&auto=format&fit=crop&q=80",
          "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "SNK-UK7", price: "2299.00", compareAtPrice: "3499.00", stock: 12, weightGrams: 750, dimensions: ["32", "20", "12"], optionValues: ["UK 7"] },
          { sku: "SNK-UK8", price: "2299.00", compareAtPrice: "3499.00", stock: 20, weightGrams: 780, dimensions: ["32", "20", "12"], optionValues: ["UK 8"] },
          { sku: "SNK-UK9", price: "2299.00", compareAtPrice: "3499.00", stock: 18, weightGrams: 810, dimensions: ["33", "21", "12"], optionValues: ["UK 9"] },
          { sku: "SNK-UK10", price: "2299.00", compareAtPrice: "3499.00", stock: 8, weightGrams: 840, dimensions: ["33", "21", "12"], optionValues: ["UK 10"] },
        ],
      },
    ],
  },
  {
    slug: "bags-luggage",
    name: "Bags & Carry",
    imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80",
    subcategories: [
      { slug: "backpacks", name: "Everyday Backpacks", imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80" },
      { slug: "travel-duffles", name: "Travel & Duffles", imageUrl: "https://images.unsplash.com/photo-1547949003-9792a18a2601?w=800&auto=format&fit=crop&q=80" },
      { slug: "wallets", name: "Wallets & EDC", imageUrl: "https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&auto=format&fit=crop&q=80" },
    ],
    products: [
      {
        slug: "transit-commuter-backpack",
        name: "Transit Weatherproof Commuter Backpack 22L",
        sub: "backpacks",
        brand: "trailpack-gear",
        description: "Durable 900D water-repellent Cordura backpack featuring a padded 16-inch laptop compartment, quick-access passport pocket, and luggage trolley sleeve.",
        tags: ["backpack", "bag", "laptop bag", "commuter", "travel", "waterproof"],
        hsnCode: "4202",
        gstRate: "18",
        countryOfOrigin: "India",
        specifications: [
          { name: "Capacity", value: "22 Litres" },
          { name: "Laptop Pocket", value: "Fits up to 16-inch MacBook Pro" },
          { name: "Outer Fabric", value: "Water-resistant 900D Cordura" },
          { name: "Hardware", value: "YKK Weatherproof Zippers" },
        ],
        options: [{ name: "Colour", values: ["Stealth Black", "Forest Green", "Storm Grey"] }],
        images: [
          "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "TR-BP-BLK", price: "2199.00", compareAtPrice: "3299.00", stock: 25, weightGrams: 750, dimensions: ["45", "30", "15"], optionValues: ["Stealth Black"] },
          { sku: "TR-BP-GRN", price: "2199.00", compareAtPrice: "3299.00", stock: 15, weightGrams: 750, dimensions: ["45", "30", "15"], optionValues: ["Forest Green"] },
          { sku: "TR-BP-GRY", price: "2199.00", compareAtPrice: "3299.00", stock: 18, weightGrams: 750, dimensions: ["45", "30", "15"], optionValues: ["Storm Grey"] },
        ],
      },
      {
        slug: "voyager-weekender-duffle",
        name: "Voyager 40L Weekender Travel Duffle",
        sub: "travel-duffles",
        brand: "trailpack-gear",
        description: "Airline carry-on approved duffle bag with a separate ventilated shoe compartment, water-resistant base, and detachable padded shoulder strap.",
        tags: ["duffle", "travel bag", "weekender", "gym bag", "carry-on"],
        hsnCode: "4202",
        gstRate: "18",
        countryOfOrigin: "India",
        specifications: [
          { name: "Volume", value: "40 Litres" },
          { name: "Dimensions", value: "52 x 28 x 26 cm" },
          { name: "Shoe Tunnel", value: "Ventilated, fits up to UK 12" },
        ],
        options: [{ name: "Colour", values: ["Charcoal Grey", "Deep Navy"] }],
        images: [
          "https://images.unsplash.com/photo-1547949003-9792a18a2601?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "VOY-DUF-GRY", price: "2799.00", compareAtPrice: "3999.00", stock: 16, weightGrams: 900, dimensions: ["52", "28", "26"], optionValues: ["Charcoal Grey"] },
          { sku: "VOY-DUF-NVY", price: "2799.00", compareAtPrice: "3999.00", stock: 12, weightGrams: 900, dimensions: ["52", "28", "26"], optionValues: ["Deep Navy"] },
        ],
      },
      {
        slug: "slim-rfid-leather-wallet",
        name: "Minimalist RFID Slim Leather Bifold Wallet",
        sub: "wallets",
        brand: "trailpack-gear",
        description: "Full-grain vegetable-tanned leather bifold wallet with built-in RFID shielding, 6 quick-access card slots, and a full-length currency sleeve.",
        tags: ["wallet", "leather", "rfid", "cardholder", "edc"],
        hsnCode: "4202",
        gstRate: "18",
        countryOfOrigin: "India",
        specifications: [
          { name: "Leather", value: "Full-Grain Vegetable Tanned" },
          { name: "Card Capacity", value: "Holds 6-10 Cards + Cash" },
          { name: "RFID Protection", value: "13.56 MHz Frequency Shielded" },
        ],
        options: [{ name: "Colour", values: ["Cognac Tan", "Midnight Black"] }],
        images: [
          "https://images.unsplash.com/photo-1627123424574-724758594e93?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "WAL-SLM-TAN", price: "899.00", compareAtPrice: "1499.00", stock: 35, weightGrams: 85, dimensions: ["11", "9", "2"], optionValues: ["Cognac Tan"] },
          { sku: "WAL-SLM-BLK", price: "899.00", compareAtPrice: "1499.00", stock: 30, weightGrams: 85, dimensions: ["11", "9", "2"], optionValues: ["Midnight Black"] },
        ],
      },
    ],
  },
  {
    slug: "home-living",
    name: "Home & Living",
    imageUrl: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800&auto=format&fit=crop&q=80",
    subcategories: [
      { slug: "kitchen-dining", name: "Kitchen & Drinkware", imageUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&auto=format&fit=crop&q=80" },
      { slug: "home-decor", name: "Lighting & Decor", imageUrl: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80" },
    ],
    products: [
      {
        slug: "vacuum-insulated-tumbler-600ml",
        name: "Vacuum Insulated Stainless Steel Tumbler 600ml",
        sub: "kitchen-dining",
        brand: "nordic-home",
        description: "Double-wall vacuum insulated 18/8 food-grade stainless steel tumbler with splash-proof magnetic slider lid. Keeps cold for 24h and hot for 12h.",
        tags: ["tumbler", "bottle", "coffee", "insulated", "flask", "drinkware"],
        hsnCode: "7323",
        gstRate: "18",
        countryOfOrigin: "India",
        specifications: [
          { name: "Capacity", value: "600 ml" },
          { name: "Insulation", value: "Double Wall Vacuum" },
          { name: "Material", value: "18/8 Food Grade Stainless Steel" },
          { name: "BPA Free", value: "Yes" },
        ],
        options: [{ name: "Colour", values: ["Matte Sage", "Cloud White", "Midnight Navy"] }],
        images: [
          "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "TUMB-SAGE", price: "849.00", compareAtPrice: "1299.00", stock: 30, weightGrams: 360, dimensions: ["8", "8", "21"], optionValues: ["Matte Sage"] },
          { sku: "TUMB-WHT", price: "849.00", compareAtPrice: "1299.00", stock: 25, weightGrams: 360, dimensions: ["8", "8", "21"], optionValues: ["Cloud White"] },
          { sku: "TUMB-NVY", price: "849.00", compareAtPrice: "1299.00", stock: 20, weightGrams: 360, dimensions: ["8", "8", "21"], optionValues: ["Midnight Navy"] },
        ],
      },
      {
        slug: "ceramic-pour-over-coffee-set",
        name: "Artisan Ceramic Pour-Over Coffee Dripper Set",
        sub: "kitchen-dining",
        brand: "nordic-home",
        description: "Handcrafted matte ceramic V60 dripper with 500ml heat-resistant borosilicate glass server carafe for barista-style manual filter coffee brewing.",
        tags: ["coffee", "pour over", "ceramic", "carafe", "brewing", "dripper"],
        hsnCode: "6912",
        gstRate: "12",
        countryOfOrigin: "India",
        specifications: [
          { name: "Server Capacity", value: "500 ml (2 Cups)" },
          { name: "Glass", value: "High Borosilicate Heat-Resistant" },
          { name: "Dripper", value: "Stoneware Ceramic V60 02" },
        ],
        images: [
          "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "COFFEE-PO-SET", price: "1299.00", compareAtPrice: "1899.00", stock: 25, weightGrams: 650, dimensions: ["20", "15", "15"] },
        ],
      },
      {
        slug: "sculptural-led-desk-lamp",
        name: "Touch Dimmable Minimalist LED Desk Lamp",
        sub: "home-decor",
        brand: "nordic-home",
        description: "Sleek matte metal desk lamp with 3 color temperatures (warm, natural, cool white), stepless brightness slider, and integrated 10W wireless charging base.",
        tags: ["lamp", "lighting", "desk", "decor", "led", "minimalist"],
        hsnCode: "9405",
        gstRate: "18",
        countryOfOrigin: "India",
        specifications: [
          { name: "Color Temperature", value: "3000K to 6000K (3 Modes)" },
          { name: "Brightness", value: "Stepless Dimming up to 550 Lumens" },
          { name: "Wireless Charger", value: "10W Qi Fast Charge Base" },
        ],
        images: [
          "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "LAMP-LED-BLK", price: "2199.00", compareAtPrice: "3299.00", stock: 20, weightGrams: 850, dimensions: ["38", "15", "15"] },
        ],
      },
      {
        slug: "amber-oakmoss-soy-candle",
        name: "Amber & Oakmoss Hand-Poured Soy Wax Candle",
        sub: "home-decor",
        brand: "nordic-home",
        description: "Hand-poured 100% natural soy wax candle infused with rich amber, earthy oakmoss, and frankincense in an apothecary amber glass jar with natural wooden wick.",
        tags: ["candle", "soy wax", "aromatherapy", "fragrance", "decor"],
        hsnCode: "3406",
        gstRate: "18",
        countryOfOrigin: "India",
        specifications: [
          { name: "Wax Type", value: "100% Natural Soy Wax" },
          { name: "Burn Time", value: "Approx. 50 Hours" },
          { name: "Wick", value: "Crackling Natural Wood Wick" },
          { name: "Net Weight", value: "240g" },
        ],
        images: [
          "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "CNDL-AMBER", price: "599.00", compareAtPrice: "899.00", stock: 40, weightGrams: 420, dimensions: ["10", "10", "12"] },
        ],
      },
    ],
  },
  {
    slug: "beauty-wellness",
    name: "Beauty & Wellness",
    imageUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80",
    subcategories: [
      { slug: "skincare", name: "Skincare", imageUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800&auto=format&fit=crop&q=80" },
      { slug: "fragrances", name: "Artisanal Fragrances", imageUrl: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&auto=format&fit=crop&q=80" },
    ],
    products: [
      {
        slug: "glow-face-serum-30ml",
        name: "10% Vitamin C & Hyaluronic Acid Glow Serum 30ml",
        sub: "skincare",
        brand: "botanica-lab",
        description: "Concentrated antioxidant glow serum featuring 10% Ethyl Ascorbic Acid, multi-molecular hyaluronic acid, and niacinamide to brighten skin tone and smooth texture.",
        tags: ["serum", "skincare", "vitamin c", "glow", "hyaluronic", "beauty"],
        hsnCode: "3304",
        gstRate: "18",
        countryOfOrigin: "India",
        specifications: [
          { name: "Net Volume", value: "30 ml" },
          { name: "Key Actives", value: "10% Vitamin C, 2% Hyaluronic Acid, 3% Niacinamide" },
          { name: "Suitable For", value: "All Skin Types, Fragrance Free" },
        ],
        images: [
          "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "SERUM-VITC-30", price: "699.00", compareAtPrice: "1099.00", stock: 45, weightGrams: 110, dimensions: ["12", "5", "5"] },
        ],
      },
      {
        slug: "cedarwood-bergamot-edp-50ml",
        name: "Cedarwood & Italian Bergamot Eau de Parfum 50ml",
        sub: "fragrances",
        brand: "botanica-lab",
        description: "Artisanal gender-neutral fragrance opening with sparkling Italian bergamot, transitioning into a heart of smoky cedarwood, and drying down to warm Haitian vetiver and amber.",
        tags: ["perfume", "fragrance", "edp", "cologne", "unisex", "cedarwood"],
        hsnCode: "3303",
        gstRate: "18",
        countryOfOrigin: "India",
        specifications: [
          { name: "Concentration", value: "Eau de Parfum (18% Essential Oils)" },
          { name: "Net Volume", value: "50 ml" },
          { name: "Longevity", value: "8-10 Hours" },
        ],
        images: [
          "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&auto=format&fit=crop&q=80",
        ],
        variants: [
          { sku: "EDP-CEDAR-50", price: "1499.00", compareAtPrice: "2299.00", stock: 25, weightGrams: 220, dimensions: ["14", "7", "7"] },
        ],
      },
    ],
  },
];

async function main() {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to run the development seed with NODE_ENV=production");
  }

  console.log("Seeding users...");
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

  console.log("Seeding pickup location...");
  const hasDefault = (await prisma.pickupLocation.count({ where: { isDefault: true } })) > 0;
  await prisma.pickupLocation.upsert({
    where: { name: pickupLocation.name },
    update: pickupLocation,
    create: { ...pickupLocation, isDefault: !hasDefault },
  });

  console.log("Seeding brands...");
  const brandIds = new Map<string, string>();
  for (const brand of brands) {
    const seededBrand = await prisma.brand.upsert({
      where: { slug: brand.slug },
      update: { name: brand.name, logoUrl: brand.logoUrl ?? null },
      create: { slug: brand.slug, name: brand.name, logoUrl: brand.logoUrl ?? null },
    });
    brandIds.set(brand.slug, seededBrand.id);
  }
  const brandDetails = new Map(brands.map((brand) => [brand.slug, brand]));

  console.log("Seeding categories and products...");
  let productCount = 0;
  let variantCount = 0;
  const categoryIdsBySlug = new Map<string, string>();

  for (const [index, category] of categories.entries()) {
    const seededCategory = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, sortOrder: index, parentId: null, imageUrl: category.imageUrl ?? null },
      create: { slug: category.slug, name: category.name, sortOrder: index, imageUrl: category.imageUrl ?? null },
    });
    categoryIdsBySlug.set(category.slug, seededCategory.id);

    const subcategoryIds = new Map<string, string>();
    for (const [subIndex, sub] of category.subcategories.entries()) {
      const seededSub = await prisma.category.upsert({
        where: { slug: sub.slug },
        update: { name: sub.name, sortOrder: subIndex, parentId: seededCategory.id, imageUrl: sub.imageUrl ?? null },
        create: { slug: sub.slug, name: sub.name, sortOrder: subIndex, parentId: seededCategory.id, imageUrl: sub.imageUrl ?? null },
      });
      subcategoryIds.set(sub.slug, seededSub.id);
      categoryIdsBySlug.set(sub.slug, seededSub.id);
    }

    for (const { slug, sub, brand, options, variants, images, ...product } of category.products) {
      const maker = brand ? brandDetails.get(brand) : undefined;
      const data = {
        ...product,
        categoryId: subcategoryIds.get(sub)!,
        brandId: brand ? brandIds.get(brand)! : null,
        manufacturerName: maker?.manufacturer ?? null,
        manufacturerAddress: maker?.address ?? null,
      };
      const seededProduct = await prisma.product.upsert({ where: { slug }, update: data, create: { ...data, slug } });

      // Re-seed product images
      if (images && images.length > 0) {
        await prisma.productImage.deleteMany({ where: { productId: seededProduct.id } });
        await prisma.productImage.createMany({
          data: images.map((url, sortOrder) => ({
            productId: seededProduct.id,
            url,
            altText: product.name,
            sortOrder,
          })),
        });
      }

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

      // Stock is set for variants ensuring they are in stock
      for (const variant of variants) {
        const inv = await prisma.inventory.findFirst({ where: { variant: { sku: variant.sku } } });
        if (!inv || inv.quantity === 0 || !idBySku.has(variant.sku)) {
          await prisma.inventory.updateMany({ where: { variant: { sku: variant.sku } }, data: { quantity: variant.stock } });
        }
      }

      variantCount += variants.length;
      productCount++;
    }
  }

  console.log("Seeding rich home screen appearance layout...");
  const appearanceConfig = {
    appName: "Shop",
    logoUrl: null,
    theme: {
      colors: {
        primary: "#0F172A",
        onPrimary: "#FFFFFF",
        accent: "#3B82F6",
        onAccent: "#FFFFFF",
      },
      radius: 12,
      cardStyle: "outlined",
      colorScheme: "light",
    },
    announcement: {
      enabled: true,
      text: "Free shipping on orders over ₹999 • 7-day easy returns",
      backgroundColor: null,
      textColor: null,
    },
    categoryTabs: {
      enabled: true,
      tabs: [
        {
          id: "tab-electronics",
          categoryId: categoryIdsBySlug.get("electronics")!,
          label: "Tech",
          icon: { type: "preset", name: "headphones" },
          badge: "Hot",
          opens: "category",
          page: null,
        },
        {
          id: "tab-fashion",
          categoryId: categoryIdsBySlug.get("fashion")!,
          label: "Fashion",
          icon: { type: "preset", name: "shirt" },
          badge: null,
          opens: "category",
          page: null,
        },
        {
          id: "tab-bags",
          categoryId: categoryIdsBySlug.get("bags-luggage")!,
          label: "Bags",
          icon: { type: "preset", name: "gift" },
          badge: null,
          opens: "category",
          page: null,
        },
        {
          id: "tab-home",
          categoryId: categoryIdsBySlug.get("home-living")!,
          label: "Living",
          icon: { type: "preset", name: "lamp" },
          badge: "New",
          opens: "category",
          page: null,
        },
      ],
    },
    homeSections: [
      {
        id: "hero-banners",
        type: "banner_carousel",
        enabled: true,
        background: null,
        autoplay: true,
        banners: [
          {
            id: "banner-audio",
            imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&auto=format&fit=crop&q=80",
            title: "Studio Sound Experience",
            subtitle: "Wireless noise-cancelling audio up to 40% off",
            link: { type: "category", categoryId: categoryIdsBySlug.get("electronics")! },
          },
          {
            id: "banner-fashion",
            imageUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&auto=format&fit=crop&q=80",
            title: "New Season Essentials",
            subtitle: "Minimalist everyday wear in organic combed cotton",
            link: { type: "category", categoryId: categoryIdsBySlug.get("fashion")! },
          },
          {
            id: "banner-bags",
            imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=1200&auto=format&fit=crop&q=80",
            title: "Built For The Journey",
            subtitle: "Weatherproof backpacks & travel gear",
            link: { type: "category", categoryId: categoryIdsBySlug.get("bags-luggage")! },
          },
        ],
      },
      {
        id: "featured-collections",
        type: "category_collection",
        enabled: true,
        background: null,
        title: "Featured Collections",
        description: "Explore our most popular departments",
        columns: 4,
        items: [
          {
            id: "col-audio",
            categoryId: categoryIdsBySlug.get("electronics")!,
            imageUrl: null,
            label: "Audio & Tech",
            badge: "Trending",
          },
          {
            id: "col-fashion",
            categoryId: categoryIdsBySlug.get("fashion")!,
            imageUrl: null,
            label: "Apparel",
            badge: "Up to 40% Off",
          },
          {
            id: "col-bags",
            categoryId: categoryIdsBySlug.get("bags-luggage")!,
            imageUrl: null,
            label: "Bags & Carry",
            badge: "Popular",
          },
          {
            id: "col-living",
            categoryId: categoryIdsBySlug.get("home-living")!,
            imageUrl: null,
            label: "Home Living",
            badge: "New",
          },
        ],
      },
      {
        id: "deals-of-the-day",
        type: "deals_rail",
        enabled: true,
        background: null,
        title: "Limited-Time Deals",
        description: "Special offers with the highest discounts today",
        categoryId: null,
        limit: 8,
      },
      {
        id: "first-order-offer",
        type: "offer_strip",
        enabled: true,
        background: null,
        title: "FLAT ₹200 OFF ON YOUR FIRST ORDER",
        subtitle: "Use code WELCOME200 at checkout • Free shipping on orders over ₹999",
        imageUrl: null,
        backgroundColor: "#0F172A",
        textColor: "#F8FAFC",
        link: { type: "none" },
      },
      {
        id: "rail-tech",
        type: "product_rail",
        enabled: true,
        background: null,
        title: "Audio & Smart Devices",
        description: "High-performance headphones, watches & accessories",
        categoryId: categoryIdsBySlug.get("electronics")!,
        limit: 6,
      },
      {
        id: "category-grid-all",
        type: "category_grid",
        enabled: true,
        background: null,
        title: "Shop by Department",
        description: "Browse our entire curated catalog",
        columns: 4,
        categoryIds: [],
      },
      {
        id: "rail-fashion",
        type: "product_rail",
        enabled: true,
        background: null,
        title: "Wardrobe Essentials",
        description: "Timeless fits tailored for everyday comfort",
        categoryId: categoryIdsBySlug.get("fashion")!,
        limit: 6,
      },
      {
        id: "brand-showcase",
        type: "brand_rail",
        enabled: true,
        background: null,
        title: "Featured Brands",
        description: "Direct from verified independent creators and makers",
        brandIds: [],
      },
      {
        id: "rail-carry",
        type: "product_rail",
        enabled: true,
        background: null,
        title: "Everyday Carry & Travel",
        description: "Ergonomic packs and travel duffles ready to go anywhere",
        categoryId: categoryIdsBySlug.get("bags-luggage")!,
        limit: 6,
      },
      {
        id: "rail-living",
        type: "product_rail",
        enabled: true,
        background: null,
        title: "Home & Coffee Living",
        description: "Elevate your daily home and workspace rituals",
        categoryId: categoryIdsBySlug.get("home-living")!,
        limit: 6,
      },
    ],
  };

  // Validate configuration against Zod schema to prevent runtime surprises
  const validatedAppearance = appearanceSchema.parse(appearanceConfig);

  await prisma.appAppearance.upsert({
    where: { id: "app" },
    update: { config: validatedAppearance as any },
    create: { id: "app", config: validatedAppearance as any },
  });

  console.log(
    `Seeded ${users.length} users, 1 pickup location, ${brands.length} brands, ${categories.length} categories, ${productCount} products with ${variantCount} variants`,
  );
  console.log("Seeded home screen layout with carousel banners, deal rails, brand showcase, and department rails.");
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
