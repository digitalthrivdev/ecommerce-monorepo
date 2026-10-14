export type UserRole = "CUSTOMER" | "ADMIN" | "STAFF";
export type DashboardRole = Extract<UserRole, "ADMIN" | "STAFF">;

export const DASHBOARD_ROLES: readonly DashboardRole[] = ["ADMIN", "STAFF"];

export function isDashboardRole(role: string): role is DashboardRole {
  return (DASHBOARD_ROLES as readonly string[]).includes(role);
}

export type CurrentUser = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  /** A demo login. A test admin can only look and run the order flow; the API refuses other changes. */
  isTestAccount: boolean;
};

export type DashboardUser = CurrentUser & { role: DashboardRole };

/** From SHIPPED on, the order follows its shipment. RTO: the parcel couldn't be delivered and goes back. */
export type OrderStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "PACKED"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "RTO";

export type PaymentMethod = "COD" | "ONLINE";
export type PaymentStatus = "PENDING" | "PROCESSING" | "PAID" | "FAILED" | "REFUNDED";

/** `add-tracking` is admin-only, for carriers without tracking (manual and the test carrier). */
export type OrderAction = "pack" | "mark-unavailable" | "ship" | "cancel" | "cancel-shipment" | "add-tracking" | "refund";

/** NDR: a delivery attempt failed and the carrier tries again. */
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

/** Updates an admin can record by hand, in the order the API lists them. */
export const MANUAL_TRACKING_STATUSES = [
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "NDR",
  "DELIVERED",
  "RTO_IN_TRANSIT",
  "RTO_DELIVERED",
  "LOST",
] as const satisfies readonly ShipmentStatus[];

export type ManualTrackingStatus = (typeof MANUAL_TRACKING_STATUSES)[number];

/** The carrier that books shipments by hand: the admin types the courier and AWB. */
export const MANUAL_CARRIER = "manual";

export type ShipmentEvent = { status: ShipmentStatus; occurredAt: string; location: string | null; description: string | null };

export type Shipment = {
  id: string;
  /** Carrier name, e.g. "manual"; fixed for the shipment's life. */
  provider: string;
  status: ShipmentStatus;
  statusAt: string;
  courierName: string | null;
  awb: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  providerOrderId: string | null;
  providerShipmentId: string | null;
  parcel: { weightGrams: number; lengthCm: string; breadthCm: string; heightCm: string };
  /** Oldest first. */
  events: ShipmentEvent[];
  createdAt: string;
};

/** The carrier new shipments are booked with, for the ship dialog. */
export type ActiveCarrier = { name: string; label: string };

export type RefundMethod = "GATEWAY" | "UPI" | "BANK_TRANSFER";
export type ComplaintReason = "DAMAGED" | "WRONG_ITEM" | "MISSING" | "EXPIRED" | "OTHER";
export type ComplaintStatus = "OPEN" | "RESOLVED" | "REJECTED";

export type Refund = {
  id: string;
  amount: string;
  method: RefundMethod;
  /** Gateway refund ID, or the UPI / bank reference. */
  reference: string | null;
  reason: string;
  createdAt: string;
  /** Null for automatic refunds (cancellation, unavailable items). */
  createdBy: string | null;
};

export type ComplaintListItem = {
  id: string;
  reason: ComplaintReason;
  status: ComplaintStatus;
  createdAt: string;
  resolvedAt: string | null;
  itemCount: number;
  refunded: string;
  order: {
    id: string;
    orderNumber: string;
    paymentMethod: PaymentMethod;
    total: string;
    customerName: string;
    customerPhone: string;
  };
};

export type ComplaintList = Paginated<ComplaintListItem> & { statusCounts: Partial<Record<ComplaintStatus, number>> };

export type ComplaintDetail = {
  id: string;
  reason: ComplaintReason;
  note: string | null;
  photoUrls: string[];
  status: ComplaintStatus;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  customer: { id: string; name: string | null; phone: string; deletedAt: string | null; complaintCount: number } | null;
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    total: string;
    customerName: string;
    customerPhone: string;
    createdAt: string;
    deliveredAt: string | null;
  };
  items: Array<{
    orderItemId: string;
    productName: string;
    variantName: string;
    sku: string;
    imageUrl: string | null;
    unitPrice: string;
    deliveredQuantity: number;
    /** Units the customer reported. */
    quantity: number;
    value: string;
  }>;
  refunds: Refund[];
  /** What can still be refunded on the order. */
  refundable: string;
  /** The reported items' value, capped at what can still be refunded. */
  suggestedRefund: string;
};

export type OrderListItem = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  total: string;
  customerName: string;
  customerPhone: string;
  createdAt: string;
  itemCount: number;
  /** When the order reached its current status. */
  statusChangedAt: string;
  allowedActions: OrderAction[];
  /** Placed through the review login, by an app store or payment gateway reviewer. */
  reviewAccount: boolean;
  shipment: Pick<Shipment, "status" | "courierName" | "awb"> | null;
};

export type OrderList = Paginated<OrderListItem> & {
  statusCounts: Partial<Record<OrderStatus, number>>;
};

/** NOT_PACKED: new for too long. NOT_SHIPPED: packed but the courier hasn't picked it up. */
export type AttentionReason = "NOT_PACKED" | "NOT_SHIPPED";

export type AttentionList = {
  items: Array<{
    orderId: string;
    orderNumber: string;
    reason: AttentionReason;
    /** When the order started waiting. */
    since: string;
  }>;
  /** Minutes before each reason is flagged. */
  minutes: Record<AttentionReason, number>;
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  /** Placed through the review login, by an app store or payment gateway reviewer. */
  reviewAccount: boolean;
  paymentMethod: PaymentMethod;
  payment: {
    status: PaymentStatus;
    amount: string;
    refundedAmount: string;
    paidAt: string | null;
    refundedAt: string | null;
  } | null;
  paymentExpiresAt: string | null;
  deliveredAt: string | null;
  /** quantity and totalPrice are as ordered; unavailableQuantity units are not charged. */
  items: Array<{
    id: string;
    productId: string;
    variantId: string;
    productName: string;
    /** Empty for products without variants. */
    variantName: string;
    sku: string | null;
    imageUrl: string | null;
    quantity: number;
    unavailableQuantity: number;
    unitPrice: string;
    compareAtPrice: string | null;
    totalPrice: string;
    chargedTotal: string;
    hsnCode: string | null;
    gstRate: string | null;
    /** This line's share of the coupon discount. */
    discount: string;
    /** GST included in the charged total, after the coupon discount. */
    taxAmount: string;
  }>;
  subtotal: string;
  deliveryFee: string;
  discount: string;
  /** The coupon that gave the discount. */
  couponCode: string | null;
  total: string;
  /** GST included in the total. */
  taxTotal: string;
  /** GST rate included in the delivery fee; null for orders placed before it was recorded. */
  deliveryFeeGstRate: string | null;
  deliveryFeeTax: string;
  /** Assigned when the order is packed. */
  invoiceNumber: string | null;
  /** Null until the order is shipped; a cancelled shipment stays until the order ships again. */
  shipment: Shipment | null;
  deliveryAddress: {
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
  };
  statusHistory: Array<{
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    note: string | null;
    createdAt: string;
    changedBy: { name: string | null; role: UserRole } | null;
  }>;
  refunds: Array<Refund & { complaintId: string | null }>;
  complaint: { id: string; reason: ComplaintReason; status: ComplaintStatus; createdAt: string } | null;
  /** The customer's rating after delivery, at most one per order. */
  rating: OrderRating | null;
  /** What an admin can still refund (delivered orders only). */
  refundable: string;
  allowedActions: OrderAction[];
  createdAt: string;
};

export type Category = {
  id: string;
  /** Null for top-level categories. Categories are at most two levels deep. */
  parentId: string | null;
  name: string;
  slug: string;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  childCount: number;
  /** Admin listings only. */
  productCount?: number;
};

export type Brand = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isActive: boolean;
  /** Admin listings only. */
  productCount?: number;
};

export type CouponDiscountType = "FLAT" | "PERCENT";
export type CouponStatus = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "USED_UP" | "INACTIVE";

/** `GET /admin/coupons`. Dates are days in the business time zone; the coupon works through the end of `endsOn`. */
export type Coupon = {
  id: string;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  /** Amount for FLAT, percentage for PERCENT. */
  discountValue: string;
  /** Cap on a percentage discount. */
  maxDiscount: string | null;
  minOrderValue: string;
  startsOn: string | null;
  endsOn: string | null;
  totalLimit: number | null;
  perCustomerLimit: number | null;
  firstOrderOnly: boolean;
  isActive: boolean;
  status: CouponStatus;
  /** Orders using it, not counting cancelled ones. */
  usedCount: number;
  /** Discount on delivered orders. */
  discountGiven: string;
  /** Used by an order, so the code and discount can't change. */
  termsLocked: boolean;
  createdAt: string;
};

type CategorySummary = { id: string; name: string; slug: string; parentId: string | null };
type BrandSummary = { id: string; name: string; slug: string };

/** Shown on the product page in this order, e.g. Material: Cotton. */
export type ProductSpecification = { name: string; value: string };

type ProductFields = {
  id: string;
  categoryId: string;
  brandId: string | null;
  name: string;
  slug: string;
  description: string | null;
  tags: string[];
  hsnCode: string | null;
  gstRate: string | null;
  manufacturerName: string | null;
  manufacturerAddress: string | null;
  countryOfOrigin: string | null;
  specifications: ProductSpecification[];
  isActive: boolean;
  category: CategorySummary;
  brand: BrandSummary | null;
};

export type ProductListItem = ProductFields & {
  /** First image shared by all variants. */
  imageUrl: string | null;
  variantCount: number;
  /** Lowest and highest price of the active variants; null when none is active. */
  priceRange: { min: string; max: string } | null;
  /** Units in stock over the active variants. */
  stockQuantity: number;
};

export type ProductOption = { id: string; name: string; values: Array<{ id: string; value: string }> };

export type ProductVariant = {
  id: string;
  sku: string;
  barcode: string | null;
  /** Option values joined ("Fruit & Nut · 60 g"); empty for the default variant of a product without options. */
  name: string;
  unit: string | null;
  quantity: string | null;
  maxOrderQuantity: number | null;
  /** GST included. */
  price: string;
  /** The higher price shown struck through, at least the price. */
  compareAtPrice: string | null;
  /** Packed weight and size, for carriers. */
  weightGrams: number | null;
  lengthCm: string | null;
  breadthCm: string | null;
  heightCm: string | null;
  /** Changed on the stock page. */
  stockQuantity: number;
  isActive: boolean;
  sortOrder: number;
  /** Name, or pack size when there is no name. */
  label: string;
  /** One value per option, in the order of `options`. */
  optionValues: Array<string | null>;
};

export type ProductImage = { id: string; url: string; altText: string | null; variantId: string | null };

export type ProductDetail = ProductFields & {
  options: ProductOption[];
  variants: ProductVariant[];
  images: ProductImage[];
};

export type InventoryItem = {
  productId: string;
  variantId: string;
  name: string;
  variantLabel: string;
  sku: string;
  barcode: string | null;
  slug: string;
  category: { id: string; name: string };
  productIsActive: boolean;
  variantIsActive: boolean;
  stockQuantity: number;
  stockUpdatedAt: string | null;
};

export type InventoryList = Paginated<InventoryItem> & { lowStockThreshold: number };

export type StockChangeReason = "RESTOCK" | "CORRECTION" | "DAMAGE" | "ORDER_UNAVAILABLE";

export type StockChange = {
  id: string;
  delta: number;
  quantityAfter: number;
  reason: StockChangeReason;
  note: string | null;
  createdAt: string;
  changedBy: { id: string; name: string | null } | null;
};

/** 1 to 5 stars; the items rating and comment are optional. */
export type OrderRating = { deliveryRating: number; itemsRating: number | null; comment: string | null; createdAt: string };

/** `GET /admin/ratings` row: a rating with 1 or 2 stars for the delivery or the items. */
export type ProductReview = {
  id: string;
  /** CUSTOMER: from a delivered order. ADMIN: added in the dashboard under `authorName`. */
  source: "CUSTOMER" | "ADMIN";
  authorName: string | null;
  rating: number;
  comment: string | null;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
  product: { id: string; name: string };
  /** Customer reviews only; `phone` is null for deleted accounts. */
  customer: { id: string; name: string | null; phone: string | null } | null;
  order: { id: string; orderNumber: string } | null;
  /** Admin reviews only: who added it. */
  addedBy: string | null;
};

export type LowRating = OrderRating & {
  id: string;
  order: { id: string; orderNumber: string; customerName: string; customerPhone: string; deliveredAt: string | null };
};

export type Customer = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  /** Set when the account was deleted; name, email and phone are gone. */
  deletedAt: string | null;
  orderBlock: CustomerBlock | null;
  createdAt: string;
};

export type CustomerBlock = "COD" | "ALL";

export type CustomerListItem = Customer & {
  orderCount: number;
  lastOrder: { id: string; orderNumber: string; status: OrderStatus; total: string; createdAt: string } | null;
};

export type CustomerAddress = {
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

export type CustomerDetails = Customer & {
  orderBlockReason: string | null;
  orderBlockedAt: string | null;
  orderBlockedBy: string | null;
  addresses: CustomerAddress[];
  stats: { orders: number; delivered: number; cancelled: number; totalSpent: string; lastOrderAt: string | null };
};

export type CustomerOrder = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  total: string;
  createdAt: string;
  itemCount: number;
};

export type PublicSettings = {
  appName: string;
  branding: { logoUrl: string | null; primaryColor: string; secondaryColor: string };
  theme: AppearanceTheme;
  currency: string;
  timezone: string;
  /** Test-account logins on a sales demo, shown on the sign-in page; null elsewhere. */
  demoLogins?: DemoLogins | null;
};

export type DemoDashboardLogin = { email: string; password: string };

export type DemoLogins = {
  admin?: DemoDashboardLogin;
  staff?: DemoDashboardLogin;
  customer?: { phone: string; code: string };
};

/** One credential of a gateway or SMS provider. Secret values are never sent back; `hint` says one is saved. */
export type CredentialField = {
  key: string;
  label: string;
  secret: boolean;
  /** Allowed values, for fields picked from a list. */
  options: string[] | null;
  optional: boolean;
  help: string | null;
  value: string | null;
  hint: string | null;
};

/** What the keys list needs from a payment gateway or SMS provider. */
export type IntegrationKeys = {
  name: string;
  label: string;
  configured: boolean;
  /** Where the keys come from. Server environment keys cannot be edited in the dashboard. */
  source: "env" | "dashboard" | null;
  editable: boolean;
  fields: CredentialField[];
  /** Keys were saved but cannot be decrypted (SECRETS_ENCRYPTION_KEY changed); enter them again. */
  savedKeysUnreadable: boolean;
  keysUpdatedAt: string | null;
};

export type OtpProviderOption = IntegrationKeys;

export type SmsSettings = {
  /** Provider chosen in the dashboard; null means none. */
  selected: string | null;
  /** Provider sending OTPs right now, or null when none is set up. */
  active: string | null;
  /** Set when OTP_PROVIDER on the server overrides the dashboard choice. */
  environmentOverride: string | null;
  /** Who can sign in by OTP while no provider is set up (their codes go to the server log). */
  fallback: "nobody" | "everyone";
  providers: OtpProviderOption[];
};

/** A gateway the platform supports and whether this deployment can use it. */
export type PaymentGatewayOption = IntegrationKeys & {
  /** Test keys or sandbox account; null when not configured. */
  testMode: boolean | null;
  /** False for the built-in test gateway. */
  needsCredentials: boolean;
  /** Null when the API has no public URL configured. */
  webhookUrl: string | null;
  webhookEvents: string | null;
};

/** Same shape as a payment gateway. The manual and test carriers need no keys. */
export type ShippingCarrierOption = PaymentGatewayOption;

/** The carrier in use, as the API decides: the chosen one while it has working keys, otherwise manual. */
export function activeCarrierOf(settings: Pick<PlatformSettings, "shippingProvider" | "shippingCarriers">) {
  const { shippingProvider, shippingCarriers } = settings;
  return (
    shippingCarriers.find((carrier) => carrier.name === shippingProvider && carrier.configured) ??
    shippingCarriers.find((carrier) => carrier.name === MANUAL_CARRIER)
  );
}

export type ReviewLogin = { enabled: boolean; phone: string | null; codeSet: boolean };

export type PlatformSettings = {
  deliveryFee: string;
  freeDeliveryThreshold: string | null;
  minOrderValue: string;
  codMaxOrderValue: string | null;
  supportPhone: string | null;
  supportEmail: string | null;
  /** Legal name and registered address, shown on the policy and contact pages. The legal name is also the seller on invoices. */
  businessName: string | null;
  businessAddress: string | null;
  /** GSTIN on invoices, when registered in the default pickup location's state. */
  gstin: string | null;
  /** GST rate included in the delivery fee, e.g. "18.00". */
  deliveryFeeGstRate: string;
  /** "Delivery in about N minutes" in the customer app; null hides it. */
  deliveryPromiseMinutes: number | null;
  websiteTagline: string | null;
  playStoreUrl: string | null;
  appStoreUrl: string | null;
  appDownloadUrl: string | null;
  /** One customer number that signs in with a fixed code, for app store and payment gateway reviewers. */
  reviewLogin: ReviewLogin;
  /** Gateway new online payments use; null means cash on delivery only. */
  paymentProvider: string | null;
  paymentGateways: PaymentGatewayOption[];
  /** Carrier new shipments are booked with; "manual" when none is chosen. */
  shippingProvider: string;
  shippingCarriers: ShippingCarrierOption[];
  /** False until SECRETS_ENCRYPTION_KEY is set on the server; keys can then only come from its environment. */
  canStoreSecrets: boolean;
  sms: SmsSettings;
  /** Null until an admin first saves; the values are then the server defaults. */
  updatedById: string | null;
  updatedAt: string;
};

/** A policy page as an admin edits it: placeholders kept, plus the template to restore. */
export type EditablePolicyPage = {
  slug: string;
  title: string;
  body: string;
  template: string;
  custom: boolean;
  updatedAt: string | null;
};

export type AppearanceLink = { type: "none" } | { type: "category"; categoryId: string };

export type AppearanceTheme = {
  colors: { primary: string; onPrimary: string; accent: string; onAccent: string };
  radius: number;
  cardStyle: "flat" | "outlined" | "elevated";
  colorScheme: "light" | "dark" | "system";
};

export type Announcement = { enabled: boolean; text: string; backgroundColor: string | null; textColor: string | null };

export type HomeBanner = { id: string; imageUrl: string; title: string | null; subtitle: string | null; link: AppearanceLink };

export type SectionEdge = "straight" | "zigzag" | "wave";

/** A coloured band behind a section. `textColor` is for the title and labels on the band; cards keep their colours. */
export type SectionBackground = { color: string; textColor: string; edge: SectionEdge };

type SectionBase = { id: string; enabled: boolean; background: SectionBackground | null };

export type HomeSection =
  | (SectionBase & { type: "banner_carousel"; banners: HomeBanner[]; autoplay: boolean })
  | (SectionBase & { type: "category_grid"; title: string | null; description: string | null; columns: 3 | 4; categoryIds: string[] })
  | (SectionBase & { type: "product_rail"; title: string; description: string | null; categoryId: string; limit: number })
  | (SectionBase & {
      type: "offer_strip";
      title: string;
      subtitle: string | null;
      imageUrl: string | null;
      backgroundColor: string;
      textColor: string;
      link: AppearanceLink;
    })
  | (SectionBase & { type: "deals_rail"; title: string; description: string | null; categoryId: string | null; limit: number })
  | (SectionBase & { type: "buy_again"; title: string; description: string | null })
  | (SectionBase & { type: "brand_rail"; title: string; description: string | null; brandIds: string[] })
  | (SectionBase & { type: "category_deals"; title: string; description: string | null; categoryIds: string[] })
  | (SectionBase & { type: "image_tiles"; title: string | null; description: string | null; layout: "grid" | "carousel"; columns: 2 | 3; tiles: HomeTile[] })
  | (SectionBase & { type: "subcategory_grid"; title: string | null; description: string | null; categoryId: string; columns: 3 | 4; limit: number })
  | (SectionBase & { type: "category_collection"; title: string | null; description: string | null; columns: 2 | 3 | 4 | 5; items: CollectionItem[] })
  | (SectionBase & {
      type: "sale_hero";
      title: string;
      subtitle: string | null;
      tagline: string | null;
      titleColor: string;
      animateTitle: boolean;
      effect: SaleHeroEffect;
      /** A tab icon name shown beside the title; null for none. */
      icon: string | null;
      /** Heading on the cycling products card; null uses "Crazy deals". */
      dealsLabel: string | null;
      /** Products to cycle in the left card. Empty hides the card. */
      productIds: string[];
      /** Category tiles on the right. Empty hides the tiles. */
      categoryIds: string[];
    });

export type SaleHeroEffect = "none" | "snow" | "sparkles" | "confetti" | "hearts";

/** Enough to label a product in the appearance editor. */
export type AppearanceProduct = { id: string; name: string; imageUrl: string | null; isActive: boolean };

/** Null `imageUrl` and `label` use the category's own. */
export type CollectionItem = { id: string; categoryId: string; imageUrl: string | null; label: string | null; badge: string | null };

export type HomeTile = { id: string; imageUrl: string; link: AppearanceLink; buttonLabel: string | null };

export type HomeSectionType = HomeSection["type"];

export type CategoryTabIcon = { type: "category" } | { type: "preset"; name: string } | { type: "image"; url: string };

/** Recolours the app's whole home header while the tab's page is open. Null `gradientColor` is a solid colour. */
export type TabHeader = { color: string; gradientColor: string | null; textColor: string; imageUrl: string | null };

export type TabPage = { header: TabHeader; sections: HomeSection[] };

/** `page` is kept while `opens` is "category", so switching back does not lose it. */
export type CategoryTab = {
  id: string;
  categoryId: string;
  label: string | null;
  icon: CategoryTabIcon;
  badge: string | null;
  opens: "category" | "page";
  page: TabPage | null;
};

/** The customer app's look and home screen, edited on the Appearance screen. */
export type Appearance = {
  appName: string;
  logoUrl: string | null;
  theme: AppearanceTheme;
  announcement: Announcement;
  categoryTabs: { enabled: boolean; tabs: CategoryTab[] };
  homeSections: HomeSection[];
};

/** `updatedAt` is null while the defaults from the server configuration are in use. */
export type AdminAppearance = Appearance & { updatedAt: string | null; updatedById: string | null };

/** Result returned by Server Actions to client components for toasts and inline errors. */
export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type Paginated<T> = { items: T[]; total: number; limit: number; offset: number };

export type StaffMember = {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  isTestAccount: boolean;
  createdAt: string;
};

/** An address carriers collect parcels from. Exactly one is the default. */
export type PickupLocation = {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string | null;
  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
  /** The GSTIN invoices carry when this is the default location; null when Settings has none for its state. */
  invoiceGstin: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DashboardStats = {
  timezone: string;
  currency: string;
  today: { orders: number; revenue: string; delivered: number; cancelled: number };
  pipeline: Record<Exclude<OrderStatus, "PENDING_PAYMENT" | "DELIVERED" | "CANCELLED" | "RTO">, number>;
  activeOrders: number;
  /** Packed, not picked up by the courier yet. */
  awaitingDispatch: number;
  lowStock: { count: number; threshold: number };
  customers: number | null;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: OrderStatus;
    total: string;
    paymentMethod: PaymentMethod;
    customerName: string;
    createdAt: string;
  }>;
};

/** A problem in a CSV import file. `row` is the spreadsheet row (the header is row 1); null for the whole file. */
export type ImportRowError = { row: number | null; column: string | null; message: string };

/** What importing a CSV file would do; nothing is saved by the check. */
export type ImportPreview = {
  rows: number;
  products: { create: number; update: number };
  variants: { create: number; update: number };
  categories: { create: string[] };
  brands: { create: string[] };
  stockRows: number;
  imageRows: number;
  errors: ImportRowError[];
  errorCount: number;
};

export type ImportJob = {
  id: string;
  status: "running" | "done" | "failed" | "interrupted";
  phase: "catalog" | "images" | "finished";
  progress: { done: number; total: number };
  startedAt: string;
  finishedAt: string | null;
  result: {
    productsCreated: number;
    productsUpdated: number;
    variantsCreated: number;
    variantsUpdated: number;
    categoriesCreated: number;
    brandsCreated: number;
    stockChanged: number;
    imagesAdded: number;
    imagesSkipped: number;
    imagesFailed: number;
    failedProducts: ImportRowError[];
    warnings: ImportRowError[];
  };
  error: string | null;
};

/** An import in the recent list, without its lists of problems. */
export type ImportJobSummary = Omit<ImportJob, "result"> & {
  result: Omit<ImportJob["result"], "failedProducts" | "warnings"> & { productsFailed: number };
};
