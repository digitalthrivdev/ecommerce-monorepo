import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { apiFetch } from "./api";
import { isDashboardRole, type CurrentUser, type DashboardUser, type PublicSettings } from "./types";

/**
 * The signed-in dashboard user, verified by the API. Memoised per request, so layouts and
 * pages can both call it. Accounts without dashboard access are signed out.
 */
export const getCurrentUser = cache(async (): Promise<DashboardUser> => {
  const user = await apiFetch<CurrentUser>("/users/me");

  if (!isDashboardRole(user.role) || (user.role === "STORE_STAFF" && !user.store)) {
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
