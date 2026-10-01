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

export type Category = { id: string; name: string; slug: string; imageUrl: string | null; sortOrder: number };

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
};

/** `GET /stores/serviceability`: the nearest active store whose radius covers the point. */
export type Serviceability = { serviceable: boolean; distanceKm: number | null; store: Store | null };

/** A product as sold by one store. Money values are decimal strings. */
export type StoreProduct = {
  productId: string;
  storeProductId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  unit: string | null;
  quantity: string | null;
  category: { id: string; name: string; slug: string };
  sellingPrice: string;
  mrp: string | null;
  isAvailable: boolean;
  inStock: boolean;
};

/** Why a cart line can't be ordered as it is. */
export type CartItemIssue = "UNAVAILABLE" | "OUT_OF_STOCK" | "INSUFFICIENT_STOCK";

/** Prices are null when the store no longer sells the product. */
export type CartItem = {
  id: string;
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  unit: string | null;
  packQuantity: string | null;
  quantity: number;
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
  payment: { status: PaymentStatus; amount: string; paidAt: string | null; refundedAt: string | null } | null;
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
  items: { productId: string; productName: string; quantity: number; unitPrice: string; totalPrice: string }[];
  subtotal: string;
  deliveryFee: string;
  discount: string;
  total: string;
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

export type HomeLink = { type: "none" } | { type: "category"; category: Category };

export type BannerCarouselSection = {
  id: string;
  type: "banner_carousel";
  autoplay: boolean;
  banners: { id: string; imageUrl: string; title: string | null; subtitle: string | null; link: HomeLink }[];
};

export type CategoryGridSection = { id: string; type: "category_grid"; title: string | null; columns: 3 | 4; categories: Category[] };

export type ProductRailSection = { id: string; type: "product_rail"; title: string; category: Category; products: StoreProduct[] };

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

export type HomeSection = BannerCarouselSection | CategoryGridSection | ProductRailSection | OfferStripSection;

/** `GET /home`: the admin's home sections, ready to render in order. */
export type HomeFeed = { storeId: string | null; sections: HomeSection[] };
