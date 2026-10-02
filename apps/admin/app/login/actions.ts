"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { ApiError, apiFetch } from "@/lib/api";
import { emailInput } from "@/lib/form-schemas";
import { setSession } from "@/lib/session";
import { isDashboardRole, type UserRole } from "@/lib/types";

export type LoginState = {
  email?: string;
  error?: string;
  fieldErrors?: { email?: string; password?: string };
};

const passwordSchema = z.string().min(1, "Enter your password").max(200);

/** Only same-origin paths, so the login form cannot be used as an open redirect. */
function safeNextPath(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") && !path.startsWith("/login")
    ? path
    : "/";
}

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = String(formData.get("email") ?? "");
  const email = emailInput.safeParse(rawEmail);
  const password = passwordSchema.safeParse(formData.get("password") ?? "");
  if (!email.success || !password.success) {
    return {
      email: rawEmail,
      fieldErrors: { email: email.error?.issues[0]?.message, password: password.error?.issues[0]?.message },
    };
  }

  let session: { accessToken: string; user: { role: UserRole } };
  try {
    session = await apiFetch("/auth/login", {
      method: "POST",
      body: { email: email.data, password: password.data },
      auth: false,
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { email: email.data, error: error.message };
  }

  if (!isDashboardRole(session.user.role)) {
    return { email: email.data, error: "This account does not have access to the dashboard." };
  }

  await setSession(session.accessToken);
  redirect(safeNextPath(formData.get("next")));
}
