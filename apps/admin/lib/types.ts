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

export type PublicSettings = {
  appName: string;
  branding: { logoUrl: string | null; primaryColor: string; secondaryColor: string };
  currency: string;
  timezone: string;
};

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
