import { UserRole } from "../generated/prisma/client";
import { AppError } from "./errors.js";

const ROLE_WITH_ARTICLE: Record<UserRole, string> = {
  CUSTOMER: "a customer",
  DELIVERY_PARTNER: "a delivery partner",
  STORE_STAFF: "store staff",
  ADMIN: "an admin",
};

/** One phone number maps to one account, so it cannot be reused for a different role. */
export function roleConflictError(role: UserRole) {
  return new AppError(409, "USER_HAS_OTHER_ROLE", `This phone number is already registered as ${ROLE_WITH_ARTICLE[role]}`);
}
