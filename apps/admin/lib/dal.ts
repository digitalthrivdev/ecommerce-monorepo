import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { apiFetch } from "./api";
import {
  activeCarrierOf,
  isDashboardRole,
  MANUAL_CARRIER,
  type ActiveCarrier,
  type CurrentUser,
  type DashboardUser,
  type PlatformSettings,
  type PublicSettings,
} from "./types";

/**
 * The signed-in dashboard user, verified by the API. Memoised per request, so layouts and
 * pages can both call it. Accounts without dashboard access are signed out.
 */
export const getCurrentUser = cache(async (): Promise<DashboardUser> => {
  const user = await apiFetch<CurrentUser>("/users/me");

  if (!isDashboardRole(user.role)) {
    redirect("/auth/signout?error=no-access");
  }

  return user as DashboardUser;
});

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (user.role !== "ADMIN") {
    redirect("/");
  }
  return user;
}

export const getPublicSettings = cache(() => apiFetch<PublicSettings>("/settings", { auth: false }));

/** The carrier new shipments are booked with. Null for staff, who can't read the platform settings. */
export const getActiveCarrier = cache(async (): Promise<ActiveCarrier | null> => {
  const user = await getCurrentUser();
  if (user.role !== "ADMIN") return null;
  const carrier = activeCarrierOf(await apiFetch<PlatformSettings>("/settings/platform"));
  return { name: carrier?.name ?? MANUAL_CARRIER, label: carrier?.label ?? "Manual" };
});
