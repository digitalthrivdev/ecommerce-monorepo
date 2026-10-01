"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { useTheme } from "next-themes";
import {
  Bike,
  Boxes,
  ChevronsUpDown,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Package,
  Palette,
  Settings,
  ShoppingBag,
  Store,
  Sun,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

import { signOut } from "@/app/(dashboard)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ROLE_LABELS } from "@/lib/format";
import type { DashboardRole, DashboardUser } from "@/lib/types";

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  roles: readonly DashboardRole[];
  /** Screens that are not built yet are shown disabled. */
  ready?: boolean;
};

const BOTH: readonly DashboardRole[] = ["ADMIN", "STORE_STAFF"];
const ADMIN: readonly DashboardRole[] = ["ADMIN"];

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Operations",
    items: [
      { title: "Dashboard", href: "/", icon: LayoutDashboard, roles: BOTH, ready: true },
      { title: "Orders", href: "/orders", icon: ShoppingBag, roles: BOTH, ready: true },
      { title: "Inventory", href: "/inventory", icon: Boxes, roles: BOTH, ready: true },
      { title: "Delivery partners", href: "/delivery-partners", icon: Bike, roles: ADMIN, ready: true },
    ],
  },
  {
    label: "Catalog",
    items: [
      { title: "Products", href: "/products", icon: Package, roles: ADMIN, ready: true },
      { title: "Categories", href: "/categories", icon: Tags, roles: ADMIN, ready: true },
      { title: "Stores", href: "/stores", icon: Store, roles: ADMIN, ready: true },
    ],
  },
  {
    label: "Administration",
    items: [
      { title: "Customers", href: "/customers", icon: Users, roles: ADMIN, ready: true },
      { title: "Appearance", href: "/appearance", icon: Palette, roles: ADMIN, ready: true },
      { title: "Settings", href: "/settings", icon: Settings, roles: ADMIN, ready: true },
    ],
  },
];

function initials(user: DashboardUser) {
  const source = user.name?.trim() || user.phone.slice(-2);
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AppSidebar({ user, appName }: { user: DashboardUser; appName: string }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [signingOut, startSignOut] = useTransition();

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <ShoppingBag className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{appName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.role === "STORE_STAFF" ? user.store?.name : "Admin dashboard"}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => item.roles.includes(user.role));
          if (items.length === 0) return null;

          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      {item.ready ? (
                        <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
                          <Link href={item.href}>
                            <item.icon />
                            <span>{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      ) : (
                        <>
                          <SidebarMenuButton disabled tooltip={`${item.title} (coming soon)`}>
                            <item.icon />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                          <SidebarMenuBadge className="text-muted-foreground">Soon</SidebarMenuBadge>
                        </>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">{initials(user)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name ?? user.phone}</span>
                    <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="grid text-sm leading-tight">
                    <span className="truncate font-medium">{user.name ?? "Unnamed user"}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.phone}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Sun />
                    Theme
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                      <DropdownMenuRadioItem value="light">
                        <Sun /> Light
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="dark">
                        <Moon /> Dark
                      </DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="system">
                        <Monitor /> System
                      </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={signingOut} onSelect={() => startSignOut(() => signOut())}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
