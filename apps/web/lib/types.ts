/** The parts of GET /settings the website uses. */
export type PublicSettings = {
  appName: string;
  branding: { logoUrl: string | null };
  theme: { colors: { primary: string; onPrimary: string; accent: string; onAccent: string } };
  timezone: string;
  currency: string;
  payments: { methods: ("COD" | "ONLINE")[] };
};

/** GET /products/:id/preview: what a shared product link shows. */
export type ProductPreview = {
  id: string;
  name: string;
  description: string | null;
  brand: string | null;
  imageUrl: string | null;
  /** The cheapest variant in stock, null while nothing is; `varies` when other variants cost more. */
  price: { price: string; compareAtPrice: string | null; label: string; varies: boolean } | null;
};

/** Business details on the website; `name` falls back to the app name. */
export type PolicyBusiness = {
  appName: string;
  logoUrl: string | null;
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
};

/** Where to get an app. `download` is only set while the app has no store listing. */
export type AppLinks = {
  playStore: string | null;
  appStore: string | null;
  download: string | null;
};

/** GET /settings/website: home page details and policy page titles. */
export type Website = {
  business: PolicyBusiness;
  tagline: string | null;
  /** Null for an app with no links. */
  apps: { customer: AppLinks | null };
  pages: { slug: string; title: string; updatedAt: string | null }[];
};

/** A policy page with its placeholders filled in. `updatedAt` is null while it shows the template. */
export type PolicyPage = {
  slug: string;
  title: string;
  body: string;
  updatedAt: string | null;
  business: PolicyBusiness;
};

export type HomeCategory = { id: string; name: string; slug: string; imageUrl: string | null };

export type HomeLink = { type: "none" } | { type: "category"; category: HomeCategory };

/** A coloured band behind a section, as set in Appearance. */
export type SectionBackground = { color: string; textColor: string; edge: "straight" | "zigzag" | "wave" } | null;

type SectionBase = { id: string; background: SectionBackground };
type Titled = { title: string | null; description: string | null };

/** The home sections the website shows. Product, deal, brand and buy-again sections are skipped. */
export type HomeSection = SectionBase &
  (
    | { type: "banner_carousel"; autoplay: boolean; banners: { id: string; imageUrl: string; title: string | null; subtitle: string | null; link: HomeLink }[] }
    | ({ type: "category_grid"; columns: number; categories: HomeCategory[] } & Titled)
    | ({ type: "subcategory_grid"; columns: number; category: HomeCategory; categories: HomeCategory[] } & Titled)
    | ({
        type: "category_collection";
        columns: number;
        items: { id: string; label: string; imageUrl: string | null; badge: string | null; category: HomeCategory }[];
      } & Titled)
    | ({ type: "image_tiles"; layout: "grid" | "carousel"; columns: number; tiles: { id: string; imageUrl: string; link: HomeLink; buttonLabel: string | null }[] } & Titled)
    | { type: "offer_strip"; title: string; subtitle: string | null; imageUrl: string | null; backgroundColor: string; textColor: string; link: HomeLink }
  );

/** GET /home includes the enabled Appearance sections and their catalog data. */
export type HomeFeed = { sections: (HomeSection | ShopHomeSection)[] };

export type Page<T> = { items: T[]; total: number; limit: number; offset: number };

export type CategorySummary = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  childCount: number;
};

export type CategoryDetail = CategorySummary & {
  parent: { id: string; name: string; slug: string } | null;
  children: { id: string; name: string; slug: string; imageUrl: string | null; isActive: boolean; sortOrder: number }[];
};

export type CatalogVariant = {
  variantId: string;
  label: string;
  name: string;
  unit: string | null;
  quantity: string | null;
  imageUrl: string | null;
  price: string;
  compareAtPrice: string | null;
  inStock: boolean;
  maxOrderQuantity: number;
  optionValueIds?: string[];
};

export type CatalogProduct = {
  productId: string;
  name: string;
  slug: string;
  category: { id: string; name: string; slug: string; parentId: string | null };
  brand: { id: string; name: string; slug: string; logoUrl: string | null } | null;
  imageUrl: string | null;
  variants: CatalogVariant[];
  rating: { average: string; count: number } | null;
};

export type CatalogImage = { id: string; url: string; altText: string | null; variantId: string | null };

export type CatalogProductDetail = Omit<CatalogProduct, "rating"> & {
  description: string | null;
  manufacturerName: string | null;
  manufacturerAddress: string | null;
  countryOfOrigin: string | null;
  specifications: unknown;
  images: CatalogImage[];
  options: { id: string; name: string; values: { id: string; value: string }[] }[];
};

export type ProductReviews = {
  average: string | null;
  count: number;
  distribution: number[];
  items: { id: string; rating: number; comment: string | null; updatedAt: string; name: string; verified: boolean }[];
  total: number;
  limit: number;
  offset: number;
};

export type Serviceability = { pincode: string; serviceable: boolean; codAvailable: boolean; etaDays: number | null };

export type CartItemIssue = "UNAVAILABLE" | "OUT_OF_STOCK" | "INSUFFICIENT_STOCK" | "QUANTITY_LIMIT";

export type Cart = {
  id: string | null;
  items: {
    id: string;
    productId: string;
    variantId: string;
    name: string;
    variantLabel: string;
    slug: string;
    imageUrl: string | null;
    unit: string | null;
    packQuantity: string | null;
    quantity: number;
    maxQuantity: number;
    unitPrice: string | null;
    compareAtPrice: string | null;
    lineTotal: string | null;
    issue: CartItemIssue | null;
    availableQuantity?: number;
  }[];
  itemCount: number;
  subtotal: string;
  coupon: { code: string; description: string | null; applied: boolean; message: string | null } | null;
  bill: {
    subtotal: string;
    shippingFee: string;
    codFee: string;
    discount: string;
    total: string;
    totalWithCod: string;
    minOrderValue: string;
    meetsMinimum: boolean;
    amountToFreeShipping: string | null;
  } | null;
  checkout: {
    blocked: boolean;
    paymentMethods: ("COD" | "ONLINE")[];
    codUnavailable: "BLOCKED" | "LIMIT" | null;
    codMaxOrderValue: string | null;
  } | null;
  isValid: boolean;
};

export type Address = {
  id: string;
  label: string | null;
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
};

export type OrderSummary = {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: "COD" | "ONLINE";
  total: string;
  createdAt: string;
  itemCount: number;
  canCancel: boolean;
  canRate: boolean;
};

export type ShipmentTracking = {
  status: string;
  courierName: string | null;
  awb: string | null;
  trackingUrl: string | null;
  events: { status: string; occurredAt: string; location: string | null; description: string | null }[];
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  status: string;
  canCancel: boolean;
  paymentMethod: "COD" | "ONLINE";
  payment: { status: string; amount: string; refundedAmount: string; paidAt: string | null; refundedAt: string | null } | null;
  paymentExpiresAt: string | null;
  items: {
    id: string;
    productId: string;
    variantId: string | null;
    productName: string;
    variantName: string;
    imageUrl: string | null;
    quantity: number;
    unavailableQuantity: number;
    unitPrice: string;
    totalPrice: string;
    chargedTotal: string;
  }[];
  subtotal: string;
  shippingFee: string;
  codFee: string;
  discount: string;
  couponCode: string | null;
  total: string;
  taxTotal: string;
  invoiceNumber: string | null;
  shipment: ShipmentTracking | null;
  deliveryAddress: {
    name: string;
    phone: string;
    addressLine1: string;
    addressLine2: string | null;
    landmark: string | null;
    city: string;
    state: string;
    postalCode: string;
  };
  statusHistory: { toStatus: string; createdAt: string; note: string | null }[];
  createdAt: string;
};

export type WishlistItem = {
  productId: string;
  name: string;
  imageUrl: string | null;
  addedAt: string;
  product: CatalogProduct | null;
};

export type BrandSummary = { id: string; name: string; slug: string; logoUrl: string | null; productCount: number };

/** Home sections that list products or brands. The website links them into the shop. */
export type ShopHomeSection = SectionBase &
  (
    | ({ type: "product_rail"; category: HomeCategory; products: CatalogProduct[] } & Titled)
    | ({ type: "deals_rail"; category: HomeCategory | null; products: CatalogProduct[] } & Titled)
    | ({ type: "brand_rail"; brands: BrandSummary[] } & Titled)
    | ({
        type: "category_deals";
        categories: (HomeCategory & { maxDiscountPercent: number })[];
      } & Titled)
    | {
        type: "sale_hero";
        title: string;
        subtitle: string | null;
        tagline: string | null;
        deals: { label: string; category: HomeCategory | null; products: CatalogProduct[] } | null;
        categories: (HomeCategory & { maxDiscountPercent: number; imageUrls: string[] })[];
      }
    | ({ type: "buy_again" } & Titled)
  );
