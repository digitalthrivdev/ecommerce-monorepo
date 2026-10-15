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
  pricing: { shippingFee: string; freeShippingThreshold: string | null; codFee: string; minOrderValue: string };
  payments: { methods: ("COD" | "ONLINE")[]; onlinePaymentTimeoutMinutes: number };
  support: { phone: string | null; email: string | null };
  /** Links to the public website and its policy pages; null when it is not set up, missing from older servers. */
  policies?: Record<"home" | "index" | "terms" | "privacy" | "refunds" | "shipping" | "contact", string> | null;
  /** Test-account logins on a sales demo, offered on the sign-in screen; null elsewhere, missing from older servers. */
  demoLogins?: { customer?: DemoPhoneLogin } | null;
};

export type DemoPhoneLogin = { phone: string; code: string };

export type UserRole = "CUSTOMER" | "ADMIN" | "STAFF";

export type User = { id: string; phone: string; name: string | null; email: string | null; role: UserRole };

/** `parentId` is set on sub-categories; `childCount` counts a category's sub-categories. */
export type Category = { id: string; name: string; slug: string; imageUrl: string | null; sortOrder: number; parentId: string | null; childCount: number };

export type Paginated<T> = { items: T[]; total: number; limit: number; offset: number };

/** A saved product; `product` is null when none of its variants is on sale. */
export type WishlistItem = {
  productId: string;
  name: string;
  imageUrl: string | null;
  addedAt: string;
  product: Product | null;
};

export type Coordinates = { latitude: number; longitude: number };

/** Coordinates are decimal strings; the map pin is optional, so they may be null. */
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

export type AddressInput = Omit<Address, "id" | "latitude" | "longitude" | "isDefault"> & Partial<Coordinates> & { isDefault?: boolean };

/** One pack or option of a product. Money values are decimal strings. */
export type ProductVariant = {
  variantId: string;
  /** "Red / Large", or the pack size ("500 g") when the variant has no name. */
  label: string;
  name: string;
  unit: string | null;
  quantity: string | null;
  imageUrl: string | null;
  price: string;
  /** The higher "was" price shown struck through; null when there is none. */
  compareAtPrice: string | null;
  inStock: boolean;
  maxOrderQuantity: number;
  /** Present on product detail responses; used by the carrier pincode check. */
  weightGrams?: number | null;
};

export type BrandSummary = { id: string; name: string; slug: string; logoUrl: string | null };

/** `GET /catalog/brands`: brands with something in stock. */
export type CatalogBrand = BrandSummary & { productCount: number };

/** A product card, with the variants on sale. */
export type Product = {
  productId: string;
  name: string;
  slug: string;
  category: { id: string; name: string; slug: string; parentId: string | null };
  brand: BrandSummary | null;
  imageUrl: string | null;
  variants: ProductVariant[];
  /** Null until the product has a rating. */
  rating: { average: string; count: number } | null;
};

export type ProductImage = { id: string; url: string; altText: string | null; variantId: string | null };

export type ProductOption = { id: string; name: string; values: { id: string; value: string }[] };

export type ProductSpecification = { name: string; value: string };

/** `GET /catalog/products/:productId`. */
export type ProductDetail = Omit<Product, "variants"> & {
  description: string | null;
  manufacturerName: string | null;
  manufacturerAddress: string | null;
  countryOfOrigin: string | null;
  specifications: ProductSpecification[];
  images: ProductImage[];
  options: ProductOption[];
  variants: (ProductVariant & { optionValueIds: string[] })[];
};

/** Why a cart line can't be ordered as it is. */
export type CartItemIssue = "UNAVAILABLE" | "OUT_OF_STOCK" | "INSUFFICIENT_STOCK" | "QUANTITY_LIMIT";

/** Prices are null when the variant is no longer on sale. */
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
  compareAtPrice: string | null;
  lineTotal: string | null;
  issue: CartItemIssue | null;
  availableQuantity?: number;
  weightGrams?: number | null;
};

/** Preview of the checkout bill for the orderable items; checkout recalculates it. */
export type CartBill = {
  subtotal: string;
  shippingFee: string;
  codFee: string;
  discount: string;
  /** What a prepaid order pays. */
  total: string;
  /** `total` plus the cash-on-delivery charge. */
  totalWithCod: string;
  minOrderValue: string;
  meetsMinimum: boolean;
  amountToFreeShipping: string | null;
};

/** `GET /cart`. `bill` is null while the cart is empty. */
export type Cart = {
  id: string | null;
  items: CartItem[];
  itemCount: number;
  subtotal: string;
  bill: CartBill | null;
  checkout: CheckoutOptions | null;
  isValid: boolean;
  coupon: CartCoupon | null;
};

/** The code saved on the cart. When `applied` is false, `message` says why it doesn't apply right now. */
export type CartCoupon = { code: string; description: string | null; applied: boolean; message: string | null };

/** What this customer can do at checkout for the cart's total. */
export type CheckoutOptions = {
  /** An admin blocked this account from ordering. */
  blocked: boolean;
  paymentMethods: PaymentMethod[];
  /** Why cash on delivery is missing: the account is blocked from it, or the total is over the limit. */
  codUnavailable: "BLOCKED" | "LIMIT" | null;
  codMaxOrderValue: string | null;
};

export type OrderStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "PACKED"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  /** Couldn't be delivered and is going back to the seller. */
  | "RTO";

export type ShipmentStatus =
  | "PENDING"
  | "AWB_ASSIGNED"
  | "PICKUP_SCHEDULED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "NDR"
  | "RTO_IN_TRANSIT"
  | "RTO_DELIVERED"
  | "CANCELLED"
  | "LOST";

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
  itemCount: number;
  canCancel: boolean;
  /** Delivered in the last 7 days and not rated yet. */
  canRate: boolean;
};

/** 1 to 5 stars; the items rating and comment are optional. */
export type OrderRating = { deliveryRating: number; itemsRating: number | null; comment: string | null; createdAt: string };

/** `GET /products/:id/reviews`: the rating over all visible reviews, and the ones with a comment. */
export type ProductReviews = Paginated<{
  id: string;
  rating: number;
  comment: string;
  name: string;
  /** From a customer's delivered order; false for reviews an admin added. */
  verified: boolean;
  updatedAt: string;
}> & {
  /** One decimal, e.g. "4.3"; null without ratings. */
  average: string | null;
  count: number;
  /** Ratings with 1 to 5 stars, in that order. */
  distribution: number[];
};

/** `GET /orders/:id/reviews`: the products received in a delivered order, with the customer's review of each. */
export type OrderReviewItem = { productId: string; productName: string; imageUrl: string | null; rating: number | null; comment: string | null };

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
  deliveredAt: string | null;
  /** quantity and totalPrice are as ordered; unavailableQuantity units could not be supplied and are not charged. */
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
    compareAtPrice: string | null;
    totalPrice: string;
    chargedTotal: string;
  }[];
  subtotal: string;
  shippingFee: string;
  codFee: string;
  discount: string;
  /** The coupon that gave the discount. */
  couponCode: string | null;
  total: string;
  /** GST included in the item prices. */
  taxTotal: string;
  /** Assigned once the order is packed. */
  invoiceNumber: string | null;
  /** The courier's tracking; null until a shipment is booked. Events are oldest first. */
  shipment: {
    status: ShipmentStatus;
    courierName: string | null;
    awb: string | null;
    trackingUrl: string | null;
    events: { status: ShipmentStatus; occurredAt: string; location: string | null; description: string | null }[];
  } | null;
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
  /** Money paid back: automatically for cancelled or unavailable items, or by an admin after delivery. */
  refunds: { id: string; amount: string; method: RefundMethod; reason: string; createdAt: string }[];
  returnRequest: OrderComplaint | null;
  /** Delivered recently enough to report a problem, and not reported yet. */
  canRequestReturn: boolean;
  rating: OrderRating | null;
  /** Delivered in the last 7 days and not rated yet. */
  canRate: boolean;
  createdAt: string;
};

export type RefundMethod = "GATEWAY" | "UPI" | "BANK_TRANSFER";
export type ComplaintReason = "DAMAGED" | "WRONG_ITEM" | "MISSING" | "EXPIRED" | "OTHER";

export type OrderComplaint = {
  id: string;
  reason: ComplaintReason;
  note: string | null;
  photoUrls: string[];
  status: "OPEN" | "APPROVED" | "RECEIVED" | "RESOLVED" | "REJECTED";
  resolutionNote: string | null;
  reverseCourierName: string | null;
  reverseAwb: string | null;
  reverseTrackingUrl: string | null;
  createdAt: string;
  resolvedAt: string | null;
  items: { orderItemId: string; quantity: number }[];
};

export type HomeLink = { type: "none" } | { type: "category"; category: Category };

export type BannerCarouselSection = {
  id: string;
  type: "banner_carousel";
  autoplay: boolean;
  banners: { id: string; imageUrl: string; title: string | null; subtitle: string | null; link: HomeLink }[];
};

export type CategoryGridSection = { id: string; type: "category_grid"; title: string | null; description: string | null; columns: 3 | 4; categories: Category[] };

export type ProductRailSection = { id: string; type: "product_rail"; title: string; description: string | null; category: Category; products: Product[] };

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
export type DealsRailSection = { id: string; type: "deals_rail"; title: string; description: string | null; category: Category | null; products: Product[] };

/** The app loads the signed-in customer's products itself. */
export type BuyAgainSection = { id: string; type: "buy_again"; title: string; description: string | null };

export type BrandRailSection = { id: string; type: "brand_rail"; title: string; description: string | null; brands: CatalogBrand[] };

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

export type SaleHeroEffect = "none" | "snow" | "sparkles" | "confetti" | "hearts";

/**
 * A festive sale block. `icon` is a tab icon name shown beside the title; `deals` is null when its card is
 * hidden or has nothing to show; each category's `imageUrls` are its biggest deals.
 */
export type SaleHeroSection = {
  id: string;
  type: "sale_hero";
  title: string;
  subtitle: string | null;
  tagline: string | null;
  titleColor: string;
  animateTitle: boolean;
  effect: SaleHeroEffect;
  icon: string | null;
  deals: { label: string; category: Category | null; products: Product[] } | null;
  categories: (Category & { maxDiscountPercent: number; imageUrls: string[] })[];
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
  | SaleHeroSection
) & { background?: SectionBackground | null };

/** `GET /home`: the admin's category tabs and home sections, ready to render in order. */
export type HomeFeed = { categoryTabs?: CategoryTab[]; sections: HomeSection[] };

/** `GET /home?tabId=`: the sections of a tab's own page. */
export type HomeTabPage = { tabId: string; sections: HomeSection[] };
