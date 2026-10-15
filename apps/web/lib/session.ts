import "server-only";

import { cache } from "react";

import { ApiError, apiAuth, readToken } from "./api";

export type Customer = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  role: string;
  isTestAccount: boolean;
};

/** The signed-in customer, or null when the cookie is missing or no longer accepted. */
export const getCustomer = cache(async () => {
  if (!(await readToken())) return null;
  try {
    const user = await apiAuth<Customer>("/users/me");
    return user.role === "CUSTOMER" ? user : null;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
});
