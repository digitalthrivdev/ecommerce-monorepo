export type UserRole = "CUSTOMER" | "ADMIN" | "STORE_STAFF" | "DELIVERY_PARTNER";
export type DashboardRole = Extract<UserRole, "ADMIN" | "STORE_STAFF">;

export const DASHBOARD_ROLES: readonly DashboardRole[] = ["ADMIN", "STORE_STAFF"];

export function isDashboardRole(role: string): role is DashboardRole {
  return (DASHBOARD_ROLES as readonly string[]).includes(role);
}

export type StoreSummary = { id: string; name: string; code: string };

export type CurrentUser = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  store: StoreSummary | null;
};

export type DashboardUser = CurrentUser & { role: DashboardRole };

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
export type DeliveryStatus = "PENDING" | "ASSIGNED" | "PICKED_UP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
export type DeliveryPartnerStatus = "OFFLINE" | "ONLINE" | "BUSY";

export type StoreOrderAction = "accept" | "start-picking" | "pack" | "ready";
export type OrderAction = StoreOrderAction | "assign" | "reassign" | "cancel" | "mark-unavailable";

export type OrderListItem = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  total: string;
  customerName: string;
  customerPhone: string;
  createdAt: string;
  store: { id: string; name: string };
  itemCount: number;
  /** When the order reached its current status. */
  statusChangedAt: string;
  rider: { name: string | null; phone: string } | null;
  allowedActions: OrderAction[];
};

export type OrderList = Paginated<OrderListItem> & {
  statusCounts: Partial<Record<OrderStatus, number>>;
};

export type OrderDetail = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  payment: {
    status: PaymentStatus;
    amount: string;
    refundedAmount: string;
    paidAt: string | null;
    refundedAt: string | null;
  } | null;
  paymentExpiresAt: string | null;
  delivery: {
    status: DeliveryStatus;
    partner: { name: string | null; phone: string; vehicleType: string | null; vehicleNumber: string | null } | null;
    assignedAt: string | null;
    pickedUpAt: string | null;
    deliveredAt: string | null;
  } | null;
  store: { id: string; name: string; phone: string | null };
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
    mrp: string | null;
    totalPrice: string;
    chargedTotal: string;
    hsnCode: string | null;
    gstRate: string | null;
    /** GST included in the charged total. */
    taxAmount: string;
  }>;
  subtotal: string;
  deliveryFee: string;
  discount: string;
  total: string;
  /** GST included in the total. */
  taxTotal: string;
  /** Assigned when the order is delivered. */
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

type CategorySummary = { id: string; name: string; slug: string; parentId: string | null };
type BrandSummary = { id: string; name: string; slug: string };

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
  isVeg: boolean | null;
  manufacturerName: string | null;
  manufacturerAddress: string | null;
  countryOfOrigin: string | null;
  fssaiLicense: string | null;
  shelfLife: string | null;
  ingredients: string | null;
  isActive: boolean;
  category: CategorySummary;
  brand: BrandSummary | null;
};

export type ProductListItem = ProductFields & {
  /** First image shared by all variants. */
  imageUrl: string | null;
  variantCount: number;
  /** Admin listings only. */
  storeCount?: number;
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

export type Listing = {
  storeProductId: string;
  sellingPrice: string;
  mrp: string | null;
  isAvailable: boolean;
  stockQuantity: number;
};

export type ProductListings = {
  variants: Array<{ id: string; sku: string; name: string; label: string; isActive: boolean }>;
  /** Every store, with the listing of each variant there (null where it is not listed). */
  items: Array<{ store: Store; listings: Array<{ variantId: string; listing: Listing | null }> }>;
};

export type InventoryItem = {
  productId: string;
  variantId: string;
  storeProductId: string;
  name: string;
  variantLabel: string;
  sku: string;
  barcode: string | null;
  slug: string;
  category: { id: string; name: string };
  isAvailable: boolean;
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

export type DeliveryPartner = {
  id: string;
  name: string | null;
  phone: string;
  status: DeliveryPartnerStatus;
  isActive: boolean;
  vehicleType: string | null;
  vehicleNumber: string | null;
  activeDelivery: { orderId: string; orderNumber: string; orderStatus: OrderStatus; accepted: boolean } | null;
  /** Latest reported position; only kept for a few minutes. */
  lastLocation: { latitude: number; longitude: number; updatedAt: string } | null;
  createdAt: string;
};

export type PartnerList = Paginated<DeliveryPartner> & {
  counts: { all: number; online: number; busy: number; offline: number; inactive: number };
};

export type DeliveryPartnerDetails = DeliveryPartner & {
  stats: {
    today: { deliveries: number; earnings: string; cashCollected: string };
    allTime: { deliveries: number; earnings: string };
  };
};

export type PartnerDelivery = {
  id: string;
  status: DeliveryStatus;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  earning: string | null;
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    total: string;
    store: { id: string; name: string };
  };
};

export type Customer = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  createdAt: string;
};

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
  store: { id: string; name: string };
  itemCount: number;
};

export type PublicSettings = {
  appName: string;
  branding: { logoUrl: string | null; primaryColor: string; secondaryColor: string };
  theme: AppearanceTheme;
  currency: string;
  timezone: string;
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

export type PlatformSettings = {
  deliveryFee: string;
  freeDeliveryThreshold: string | null;
  minOrderValue: string;
  deliveryPartnerFee: string;
  supportPhone: string | null;
  supportEmail: string | null;
  /** Gateway new online payments use; null means cash on delivery only. */
  paymentProvider: string | null;
  paymentGateways: PaymentGatewayOption[];
  /** False until SECRETS_ENCRYPTION_KEY is set on the server; keys can then only come from its environment. */
  canStoreSecrets: boolean;
  sms: SmsSettings;
  /** Null until an admin first saves; the values are then the server defaults. */
  updatedById: string | null;
  updatedAt: string;
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

export type HomeSection =
  | { id: string; enabled: boolean; type: "banner_carousel"; banners: HomeBanner[]; autoplay: boolean }
  | { id: string; enabled: boolean; type: "category_grid"; title: string | null; columns: 3 | 4; categoryIds: string[] }
  | { id: string; enabled: boolean; type: "product_rail"; title: string; categoryId: string; limit: number }
  | {
      id: string;
      enabled: boolean;
      type: "offer_strip";
      title: string;
      subtitle: string | null;
      imageUrl: string | null;
      backgroundColor: string;
      textColor: string;
      link: AppearanceLink;
    }
  | { id: string; enabled: boolean; type: "deals_rail"; title: string; categoryId: string | null; limit: number }
  | { id: string; enabled: boolean; type: "buy_again"; title: string }
  | { id: string; enabled: boolean; type: "brand_rail"; title: string; brandIds: string[] }
  | { id: string; enabled: boolean; type: "category_deals"; title: string; categoryIds: string[] }
  | { id: string; enabled: boolean; type: "image_tiles"; title: string | null; columns: 2 | 3; tiles: HomeTile[] };

export type HomeTile = { id: string; imageUrl: string; link: AppearanceLink };

export type HomeSectionType = HomeSection["type"];

/** The customer app's look and home screen, edited on the Appearance screen. */
export type Appearance = {
  appName: string;
  logoUrl: string | null;
  theme: AppearanceTheme;
  announcement: Announcement;
  homeSections: HomeSection[];
};

/** `updatedAt` is null while the defaults from the server configuration are in use. */
export type AdminAppearance = Appearance & { updatedAt: string | null; updatedById: string | null };

/** Result returned by Server Actions to client components for toasts and inline errors. */
export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type Paginated<T> = { items: T[]; total: number; limit: number; offset: number };

export type Store = StoreSummary & { status: "ACTIVE" | "INACTIVE" };

/** A store as admins see it, with operational counts. */
export type StoreDetails = Store & {
  phone: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  serviceRadiusKm: string;
  /** Weekly hours in the deployment time zone; empty means always open. */
  hours: StoreHours[];
  isOpen: boolean;
  createdAt: string;
  staffCount: number;
  productCount: number;
  activeOrderCount: number;
};

/** dayOfWeek 0 is Sunday. Times are "HH:mm"; a closing time earlier than the opening time runs past midnight. */
export type StoreHours = { dayOfWeek: number; opensAt: string; closesAt: string };

export type StaffMember = {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  /** Staff added before password sign-in existed have none and cannot sign in until one is set. */
  hasPassword: boolean;
  createdAt: string;
};

export type DashboardStats = {
  storeId: string | null;
  timezone: string;
  currency: string;
  today: { orders: number; revenue: string; delivered: number; cancelled: number };
  pipeline: Record<Exclude<OrderStatus, "PENDING_PAYMENT" | "DELIVERED" | "CANCELLED">, number>;
  activeOrders: number;
  awaitingAssignment: number;
  lowStock: { count: number; threshold: number };
  partners: { online: number; busy: number; offline: number } | null;
  customers: number | null;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: OrderStatus;
    total: string;
    paymentMethod: PaymentMethod;
    customerName: string;
    createdAt: string;
    store: { id: string; name: string };
  }>;
};
