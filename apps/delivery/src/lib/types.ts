export type CardStyle = "flat" | "outlined" | "elevated";
export type ColorSchemePreference = "light" | "dark" | "system";

export type AppTheme = {
  colors: { primary: string; onPrimary: string; accent: string; onAccent: string };
  radius: number;
  cardStyle: CardStyle;
  colorScheme: ColorSchemePreference;
};

/** `GET /settings`: the branding and support details the app uses. Money values are decimal strings. */
export type PublicSettings = {
  appName: string;
  branding: { logoUrl: string | null; primaryColor: string; secondaryColor: string };
  theme: AppTheme;
  currency: string;
  timezone: string;
  support: { phone: string | null; email: string | null };
};

export type UserRole = "CUSTOMER" | "ADMIN" | "STORE_STAFF" | "DELIVERY_PARTNER";

export type User = { id: string; phone: string; name: string | null; email: string | null; role: UserRole };

export type Paginated<T> = { items: T[]; total: number; limit: number; offset: number };

/** BUSY is set by the server while the partner has an active delivery. */
export type PartnerStatus = "OFFLINE" | "ONLINE" | "BUSY";

/** `GET /delivery/me` */
export type PartnerProfile = {
  id: string;
  name: string | null;
  phone: string;
  status: PartnerStatus;
  vehicleType: string | null;
  vehicleNumber: string | null;
  activeOrderId: string | null;
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

export type DeliveryAction = "accept" | "decline" | "pickup" | "start-delivery" | "delivered";

/** Coordinates and money are decimal strings. */
export type PartnerDelivery = {
  orderId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  deliveryStatus: string;
  /** What the partner can do next; empty once the delivery is finished. */
  allowedActions: DeliveryAction[];
  assignedAt: string | null;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  store: { name: string; phone: string | null; addressLine1: string; addressLine2: string | null; city: string; latitude: string; longitude: string };
  /** Contact details and address are only included while the delivery is in progress. */
  customer: {
    name: string;
    city: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string | null;
    landmark?: string | null;
    postalCode?: string;
    latitude?: string | null;
    longitude?: string | null;
  };
  items: { productName: string; quantity: number }[];
  paymentMethod: "COD" | "ONLINE";
  orderTotal: string;
  cashToCollect: string;
  earning: string | null;
};

/** `GET /delivery/earnings` */
export type Earnings = { from: string; to: string; currency: string; deliveries: number; earnings: string; cashCollected: string };
