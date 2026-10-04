export type CardStyle = "flat" | "outlined" | "elevated";
export type ColorSchemePreference = "light" | "dark" | "system";

export type AppTheme = {
  colors: { primary: string; onPrimary: string; accent: string; onAccent: string };
  radius: number;
  cardStyle: CardStyle;
  colorScheme: ColorSchemePreference;
};

export type Announcement = { enabled: boolean; text: string; backgroundColor: string | null; textColor: string | null };

/** `GET /settings`: everything the app needs at startup. Money values are decimal strings. */
export type PublicSettings = {
  appName: string;
  branding: { logoUrl: string | null; primaryColor: string; secondaryColor: string };
  theme: AppTheme;
  announcement: Announcement;
  currency: string;
  timezone: string;
  pricing: { deliveryFee: string; freeDeliveryThreshold: string | null; minOrderValue: string };
  payments: { methods: ("COD" | "ONLINE")[]; onlinePaymentTimeoutMinutes: number };
  support: { phone: string | null; email: string | null };
};

export type UserRole = "CUSTOMER" | "ADMIN" | "STORE_STAFF" | "DELIVERY_PARTNER";

export type User = { id: string; phone: string; name: string | null; email: string | null; role: UserRole };

/** `parentId` is set on sub-categories; `childCount` counts a category's sub-categories. */
export type Category = { id: string; name: string; slug: string; imageUrl: string | null; sortOrder: number; parentId: string | null; childCount: number };

export type Paginated<T> = { items: T[]; total: number; limit: number; offset: number };

export type Coordinates = { latitude: number; longitude: number };

/** Coordinates are decimal strings; they are null only for addresses saved without a location. */
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
  latitude: string | null;
  longitude: string | null;
  isDefault: boolean;
};

export type AddressInput = Omit<Address, "id" | "latitude" | "longitude" | "isDefault"> & Coordinates & { isDefault?: boolean };

export type Store = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  latitude: string;
  longitude: string;
  serviceRadiusKm: string;
  /** Weekly hours in the deployment's time zone; days 0–6 start on Sunday. Empty means always open. */
  hours: OpeningHours[];
  isOpen: boolean;
};

/** Times are "HH:MM"; a close time earlier than the open time runs past midnight. */
export type OpeningHours = { dayOfWeek: number; opensAt: string; closesAt: string };

/** `GET /stores/serviceability`: the nearest active store whose radius covers the point. */
export type Serviceability = { serviceable: boolean; distanceKm: number | null; store: Store | null };

/** One pack or option of a product, as sold by one store. Money values are decimal strings. */
export type StoreVariant = {
  variantId: string;
  storeProductId: string;
  /** "Red / Large", or the pack size ("500 g") when the variant has no name. */
  label: string;
  name: string;
  unit: string | null;
  quantity: string | null;
  imageUrl: string | null;
  sellingPrice: string;
  mrp: string | null;
  inStock: boolean;
  maxOrderQuantity: number;
};

export type BrandSummary = { id: string; name: string; slug: string; logoUrl: string | null };

/** `GET /stores/:storeId/brands`: brands with something in stock at the store. */
export type StoreBrand = BrandSummary & { productCount: number };

/** A product as sold by one store, with the variants it lists. */
export type StoreProduct = {
  productId: string;
  name: string;
  slug: string;
  category: { id: string; name: string; slug: string; parentId: string | null };
  brand: BrandSummary | null;
  isVeg: boolean | null;
  imageUrl: string | null;
  variants: StoreVariant[];
};

export type ProductImage = { id: string; url: string; altText: string | null; variantId: string | null };

export type ProductOption = { id: string; name: string; values: { id: string; value: string }[] };

/** `GET /stores/:storeId/products/:productId`. */
export type StoreProductDetail = Omit<StoreProduct, "variants"> & {
  description: string | null;
  manufacturerName: string | null;
  manufacturerAddress: string | null;
  countryOfOrigin: string | null;
  fssaiLicense: string | null;
  shelfLife: string | null;
  ingredients: string | null;
  images: ProductImage[];
  options: ProductOption[];
  variants: (StoreVariant & { optionValueIds: string[] })[];
};

/** Why a cart line can't be ordered as it is. */
export type CartItemIssue = "UNAVAILABLE" | "OUT_OF_STOCK" | "INSUFFICIENT_STOCK" | "QUANTITY_LIMIT";

/** Prices are null when the store no longer sells the variant. */
export type CartItem = {
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
  /** Most of this variant one order can have. */
  maxQuantity: number;
  unitPrice: string | null;
  mrp: string | null;
  lineTotal: string | null;
  issue: CartItemIssue | null;
  availableQuantity?: number;
};

/** Preview of the checkout bill for the orderable items; checkout recalculates it. */
export type CartBill = {
  subtotal: string;
  deliveryFee: string;
  discount: string;
  total: string;
  minOrderValue: string;
  meetsMinimum: boolean;
  amountToFreeDelivery: string | null;
};

/** `GET /cart`: one store's items. `store` and `bill` are null while the cart is empty. */
export type Cart = {
  id: string | null;
  store: { id: string; name: string; code: string; status: string } | null;
  /** False while the store is outside its opening hours; checkout waits until it opens. */
  storeIsOpen: boolean;
  items: CartItem[];
  itemCount: number;
  subtotal: string;
  bill: CartBill | null;
  isValid: boolean;
};

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "STORE_ACCEPTED"
  | "PICKING"
  | "PACKED"
  | "READY_FOR_PICKUP"
  | "ASSIGNED"
  | "PICKED_UP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export type PaymentMethod = "COD" | "ONLINE";
export type PaymentStatus = "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "REFUNDED";

/** `GET /orders` row. */
export type OrderSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  total: string;
  createdAt: string;
  store: { id: string; name: string };
  itemCount: number;
  canCancel: boolean;
};

/** `GET /orders/:id`. Items, prices and address are snapshots taken when the order was placed. */
export type OrderDetail = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  canCancel: boolean;
  paymentMethod: PaymentMethod;
  payment: { status: PaymentStatus; amount: string; refundedAmount: string; paidAt: string | null; refundedAt: string | null } | null;
  /** Set while an online payment is awaited; the order is cancelled after it. */
  paymentExpiresAt: string | null;
  delivery: {
    status: string;
    partner: { name: string | null; phone: string; vehicleType: string | null; vehicleNumber: string | null } | null;
    assignedAt: string | null;
    pickedUpAt: string | null;
    deliveredAt: string | null;
  } | null;
  store: { id: string; name: string; phone: string | null };
  /** quantity and totalPrice are as ordered; the store could not supply unavailableQuantity units, which are not charged. */
  items: {
    id: string;
    productId: string;
    variantId: string;
    productName: string;
    /** Empty for a product sold in a single, unnamed variant. */
    variantName: string;
    imageUrl: string | null;
    quantity: number;
    unavailableQuantity: number;
    unitPrice: string;
    mrp: string | null;
    totalPrice: string;
    chargedTotal: string;
  }[];
  subtotal: string;
  deliveryFee: string;
  discount: string;
  total: string;
  /** GST included in the item prices. */
  taxTotal: string;
  /** Assigned once the order is delivered. */
  invoiceNumber: string | null;
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
  statusHistory: { fromStatus: OrderStatus | null; toStatus: OrderStatus; note: string | null; createdAt: string }[];
  createdAt: string;
  /** Shown once a partner is on the way; the customer reads it out at the door. */
  deliveryOtp: string | null;
};

/** `GET /orders/:id/tracking`. */
export type OrderTracking = {
  orderStatus: OrderStatus;
  trackable: boolean;
  distanceKm: number | null;
  etaMinutes: number | null;
};

export type HomeLink = { type: "none" } | { type: "category"; category: Category };

export type BannerCarouselSection = {
  id: string;
  type: "banner_carousel";
  autoplay: boolean;
  banners: { id: string; imageUrl: string; title: string | null; subtitle: string | null; link: HomeLink }[];
};

export type CategoryGridSection = { id: string; type: "category_grid"; title: string | null; description: string | null; columns: 3 | 4; categories: Category[] };

export type ProductRailSection = { id: string; type: "product_rail"; title: string; description: string | null; category: Category; products: StoreProduct[] };

export type OfferStripSection = {
  id: string;
  type: "offer_strip";
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  backgroundColor: string;
  textColor: string;
  link: HomeLink;
};

/** `category` is null when deals come from every category. */
export type DealsRailSection = { id: string; type: "deals_rail"; title: string; description: string | null; category: Category | null; products: StoreProduct[] };

/** The app loads the signed-in customer's products itself. */
export type BuyAgainSection = { id: string; type: "buy_again"; title: string; description: string | null };

export type BrandRailSection = { id: string; type: "brand_rail"; title: string; description: string | null; brands: StoreBrand[] };

export type CategoryDealsSection = { id: string; type: "category_deals"; title: string; description: string | null; categories: (Category & { maxDiscountPercent: number })[] };

/** `columns` applies to the grid layout only. */
export type ImageTilesSection = {
  id: string;
  type: "image_tiles";
  title: string | null;
  description: string | null;
  layout: "grid" | "carousel";
  columns: 2 | 3;
  tiles: { id: string; imageUrl: string; link: HomeLink; buttonLabel: string | null }[];
};

/** `category` is the parent; `categories` its sub-categories. */
export type SubcategoryGridSection = { id: string; type: "subcategory_grid"; title: string; description: string | null; columns: 3 | 4; category: Category; categories: Category[] };

/** Hand-picked categories. `imageUrl` is the admin's own photo; null falls back to the category's image. */
export type CategoryCollectionSection = {
  id: string;
  type: "category_collection";
  title: string | null;
  description: string | null;
  columns: 2 | 3 | 4 | 5;
  items: { id: string; label: string; imageUrl: string | null; badge: string | null; category: Category }[];
};

/** Recolours the whole home header while a tab's page is open. Null `gradientColor` is a solid colour. */
export type TabHeader = { color: string; gradientColor: string | null; textColor: string; imageUrl: string | null };

/**
 * A null icon means the category has no image; show its first letter. Tabs that `opens` "page" show their
 * page (`GET /home?tabId=`) inside the home screen under `header`; others open the category screen.
 */
export type CategoryTab = {
  id: string;
  label: string;
  icon: { type: "preset"; name: string } | { type: "image"; url: string } | null;
  badge: string | null;
  category: Category;
  opens?: "category" | "page";
  header?: TabHeader | null;
};

/** A coloured band behind a section. `textColor` is for the title and labels on the band; cards keep their colours. */
export type SectionBackground = { color: string; textColor: string; edge: "straight" | "zigzag" | "wave" };

export type HomeSection = (
  | BannerCarouselSection
  | CategoryGridSection
  | ProductRailSection
  | OfferStripSection
  | DealsRailSection
  | BuyAgainSection
  | BrandRailSection
  | CategoryDealsSection
  | ImageTilesSection
  | SubcategoryGridSection
  | CategoryCollectionSection
) & { background?: SectionBackground | null };

/** `GET /home`: the admin's category tabs and home sections, ready to render in order. */
export type HomeFeed = { storeId: string | null; categoryTabs?: CategoryTab[]; sections: HomeSection[] };

/** `GET /home?tabId=`: the sections of a tab's own page. */
export type HomeTabPage = { storeId: string | null; tabId: string; sections: HomeSection[] };
