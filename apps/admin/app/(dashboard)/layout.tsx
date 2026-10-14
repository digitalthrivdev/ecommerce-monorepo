import { cookies } from "next/headers";

import { AppSidebar, StaffTabBar } from "@/components/app-sidebar";
import { AttentionBanner } from "@/components/orders/attention-banner";
import { NewOrderAlert } from "@/components/orders/new-order-alert";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { apiFetch } from "@/lib/api";
import { getCurrentUser, getPublicSettings } from "@/lib/dal";
import { getAttention, listOrders } from "@/lib/orders";
import type { ComplaintList } from "@/lib/types";
import { cn } from "@/lib/utils";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  const isStaff = user.role === "STAFF";
  const isAdmin = user.role === "ADMIN";
  const [settings, newOrders, attention, openComplaints, cookieStore] = await Promise.all([
    getPublicSettings().catch(() => null),
    listOrders({ status: ["CONFIRMED"], sort: "oldest", limit: 1, offset: 0 })
      .then((orders) => orders.total)
      .catch(() => 0),
    isAdmin ? getAttention().catch(() => null) : null,
    isAdmin
      ? apiFetch<ComplaintList>("/admin/complaints", { query: { status: "OPEN", limit: 1 } })
          .then((complaints) => complaints.total)
          .catch(() => 0)
      : 0,
    cookies(),
  ]);

  return (
    <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
      <AppSidebar
        user={user}
        brand={{ appName: settings?.appName ?? "Dashboard", logoUrl: settings?.branding.logoUrl ?? null }}
        newOrders={newOrders}
        openComplaints={openComplaints}
      />
      <SidebarInset className={cn("bg-background", isStaff && "pb-20 md:pb-0")}>
        {attention && <AttentionBanner initial={attention} />}
        {children}
      </SidebarInset>
      {isStaff && <StaffTabBar newOrders={newOrders} />}
      <NewOrderAlert initialCount={newOrders} staff={isStaff} />
    </SidebarProvider>
  );
}
