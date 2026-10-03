import { cookies } from "next/headers";

import { AppSidebar, StaffTabBar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser, getPublicSettings } from "@/lib/dal";
import { listOrders } from "@/lib/orders";
import { cn } from "@/lib/utils";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  const [settings, newOrders, cookieStore] = await Promise.all([
    getPublicSettings().catch(() => null),
    listOrders(user, { status: ["CONFIRMED"], sort: "oldest", limit: 1, offset: 0 })
      .then((orders) => orders.total)
      .catch(() => 0),
    cookies(),
  ]);
  const isStaff = user.role === "STORE_STAFF";

  return (
    <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
      <AppSidebar
        user={user}
        brand={{ appName: settings?.appName ?? "Dashboard", logoUrl: settings?.branding.logoUrl ?? null }}
        newOrders={newOrders}
      />
      <SidebarInset className={cn("bg-background", isStaff && "pb-20 md:pb-0")}>{children}</SidebarInset>
      {isStaff && <StaffTabBar newOrders={newOrders} />}
    </SidebarProvider>
  );
}
