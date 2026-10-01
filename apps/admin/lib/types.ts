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
export type OrderAction = StoreOrderAction | "assign" | "reassign" | "cancel";

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
  items: Array<{ productId: string; productName: string; quantity: number; unitPrice: string; totalPrice: string }>;
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

export type Category = { id: string; name: string; slug: string; isActive: boolean };

export type InventoryItem = {
  productId: string;
  storeProductId: string;
  name: string;
  slug: string;
  unit: string | null;
  packQuantity: string | null;
  category: { id: string; name: string };
  isAvailable: boolean;
  productIsActive: boolean;
  stockQuantity: number;
  stockUpdatedAt: string | null;
};

export type InventoryList = Paginated<InventoryItem> & { lowStockThreshold: number };

export type DeliveryPartner = {
  id: string;
  name: string | null;
  phone: string;
  status: DeliveryPartnerStatus;
  isActive: boolean;
  vehicleType: string | null;
  vehicleNumber: string | null;
};

export type PublicSettings = {
  appName: string;
  branding: { logoUrl: string | null; primaryColor: string; secondaryColor: string };
  currency: string;
  timezone: string;
};

/** Result returned by Server Actions to client components for toasts and inline errors. */
export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

export type Paginated<T> = { items: T[]; total: number; limit: number; offset: number };

export type Store = StoreSummary & { status: "ACTIVE" | "INACTIVE" };

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
