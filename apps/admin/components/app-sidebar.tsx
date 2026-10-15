"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useTheme } from "next-themes";
import {
  Award,
  Boxes,
  ChevronsUpDown,
  FileSpreadsheet,
  House,
  LogOut,
  Menu,
  MessageSquareText,
  MessageSquareWarning,
  Monitor,
  Moon,
  Package,
  Palette,
  Settings,
  ShoppingBag,
  Star,
  Sun,
  Tags,
  TicketPercent,
  UserCog,
  Users,
  Warehouse,
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
  useSidebar,
} from "@/components/ui/sidebar";
import { ROLE_LABELS } from "@/lib/format";
import type { DashboardRole, DashboardUser } from "@/lib/types";
import { cn } from "@/lib/utils";

type NavItem = { title: string; href: string; icon: LucideIcon; roles: readonly DashboardRole[] };

const BOTH: readonly DashboardRole[] = ["ADMIN", "STAFF"];
const ADMIN: readonly DashboardRole[] = ["ADMIN"];

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Today",
    items: [
      { title: "Home", href: "/", icon: House, roles: BOTH },
      { title: "Orders", href: "/orders", icon: ShoppingBag, roles: BOTH },
      { title: "Returns", href: "/returns", icon: MessageSquareWarning, roles: ADMIN },
      { title: "Low ratings", href: "/ratings", icon: Star, roles: BOTH },
      { title: "Product reviews", href: "/reviews", icon: MessageSquareText, roles: ADMIN },
      { title: "Stock", href: "/inventory", icon: Boxes, roles: BOTH },
    ],
  },
  {
    label: "Products",
    items: [
      { title: "Products", href: "/products", icon: Package, roles: ADMIN },
      { title: "Categories", href: "/categories", icon: Tags, roles: ADMIN },
      { title: "Brands", href: "/brands", icon: Award, roles: ADMIN },
    ],
  },
  {
    label: "Shop setup",
    items: [
      { title: "Customers", href: "/customers", icon: Users, roles: ADMIN },
      { title: "Coupons", href: "/coupons", icon: TicketPercent, roles: ADMIN },
      { title: "Staff", href: "/staff", icon: UserCog, roles: ADMIN },
      { title: "Pickup locations", href: "/pickup-locations", icon: Warehouse, roles: ADMIN },
      { title: "Reports", href: "/reports", icon: FileSpreadsheet, roles: ADMIN },
      { title: "Appearance", href: "/appearance", icon: Palette, roles: ADMIN },
      { title: "Settings", href: "/settings", icon: Settings, roles: ADMIN },
    ],
  },
];

const isActivePath = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

function initials(user: DashboardUser) {
  const source = user.name?.trim() || user.phone.slice(-2);
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

type Brand = { appName: string; logoUrl: string | null };

function BrandMark({ brand, subtitle }: { brand: Brand; subtitle: string }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A logo that failed before hydration never fires onError.
    if (logo.current?.complete && logo.current.naturalWidth === 0) setLogoFailed(true);
  }, []);
  return (
    <>
      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-primary-foreground">
        {brand.logoUrl && !logoFailed ? (
          // Logos are uploaded through the dashboard or linked from anywhere, so next/image's host list can't cover them.
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={logo} src={brand.logoUrl} alt="" onError={() => setLogoFailed(true)} className="size-full bg-white object-contain p-0.5" />
        ) : (
          <span className="text-base font-bold">{brand.appName.charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="grid flex-1 text-left leading-tight">
        <span className="truncate text-[15px] font-bold">{brand.appName}</span>
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
      </div>
    </>
  );
}

type AppSidebarProps = { user: DashboardUser; brand: Brand; newOrders: number; openComplaints: number };

export function AppSidebar({ user, brand, newOrders, openComplaints }: AppSidebarProps) {
  const badges: Record<string, { count: number; label: string }> = {
    "/orders": { count: newOrders, label: "new" },
    "/returns": { count: openComplaints, label: "open" },
  };
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { isMobile, setOpenMobile } = useSidebar();
  const [signingOut, startSignOut] = useTransition();
  const closeOnMobile = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pt-4 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent">
              <Link href="/" onClick={closeOnMobile}>
                <BrandMark brand={brand} subtitle={user.role === "STAFF" ? "Staff dashboard" : "Owner dashboard"} />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-1">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => item.roles.includes(user.role));
          if (items.length === 0) return null;

          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActivePath(pathname, item.href)} tooltip={item.title}>
                        <Link href={item.href} onClick={closeOnMobile}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                      {(badges[item.href]?.count ?? 0) > 0 && (
                        <SidebarMenuBadge className="rounded-full bg-primary px-1.5 text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-active/menu-button:text-primary-foreground">
                          {badges[item.href]!.count}
                          <span className="sr-only"> {badges[item.href]!.label}</span>
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
                  <Avatar className="size-9 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary-soft font-semibold text-primary-ink">{initials(user)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user.name ?? user.phone}</span>
                    <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="grid text-sm leading-tight">
                    <span className="truncate font-medium">{user.name ?? "No name set"}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.phone}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Sun />
                    Light or dark
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
                        <Monitor /> Same as device
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

const STAFF_TABS = [
  { title: "Home", href: "/", icon: House },
  { title: "Orders", href: "/orders", icon: ShoppingBag },
  { title: "Stock", href: "/inventory", icon: Boxes },
] as const;

/** Bottom tabs for shop staff on phones; "More" opens the full menu (theme, sign out). */
export function StaffTabBar({ newOrders }: { newOrders: number }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_8px_rgb(0_0_0/0.04)] md:hidden"
    >
      {STAFF_TABS.map((tab) => {
        const active = isActivePath(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold",
              active ? "text-primary-ink" : "text-muted-foreground",
            )}
          >
            <tab.icon className="size-6" aria-hidden />
            {tab.title}
            {tab.href === "/orders" && newOrders > 0 && (
              <span className="absolute top-2 left-1/2 ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] text-primary-foreground">
                {newOrders}
              </span>
            )}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-muted-foreground"
      >
        <Menu className="size-6" aria-hidden />
        More
      </button>
    </nav>
  );
}
