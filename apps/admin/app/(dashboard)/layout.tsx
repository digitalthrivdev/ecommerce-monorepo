import { cookies } from "next/headers";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser, getPublicSettings } from "@/lib/dal";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const [user, settings, cookieStore] = await Promise.all([
    getCurrentUser(),
    getPublicSettings().catch(() => null),
    cookies(),
  ]);

  return (
    <SidebarProvider defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
      <AppSidebar user={user} appName={settings?.appName ?? "Dashboard"} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
