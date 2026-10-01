"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { ApiError, apiFetch } from "@/lib/api";
import { phoneInput as phoneSchema } from "@/lib/form-schemas";
import { setSession } from "@/lib/session";
import { isDashboardRole, type UserRole } from "@/lib/types";

export type LoginState = {
  step: "phone" | "otp";
  phone?: string;
  message?: string;
  error?: string;
  fieldErrors?: { phone?: string; otp?: string };
};

const otpSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");

/** Only same-origin paths, so the login form cannot be used as an open redirect. */
function safeNextPath(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") && !path.startsWith("/login")
    ? path
    : "/";
}

export async function loginAction(previous: LoginState, formData: FormData): Promise<LoginState> {
  const intent = formData.get("intent");

  if (intent === "change-phone") {
    return { step: "phone", phone: previous.phone };
  }

  const phone = phoneSchema.safeParse(formData.get("phone") ?? "");
  if (!phone.success) {
    return { step: "phone", phone: String(formData.get("phone") ?? ""), fieldErrors: { phone: phone.error.issues[0]?.message } };
  }

  if (intent === "send" || intent === "resend") {
    try {
      await apiFetch("/auth/send-otp", { method: "POST", body: { phone: phone.data }, auth: false });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      return { step: intent === "resend" ? "otp" : "phone", phone: phone.data, error: error.message };
    }
    return { step: "otp", phone: phone.data, message: `We sent a 6-digit code to ${phone.data}.` };
  }

  const otp = otpSchema.safeParse(formData.get("otp") ?? "");
  if (!otp.success) {
    return { step: "otp", phone: phone.data, fieldErrors: { otp: otp.error.issues[0]?.message } };
  }

  let session: { accessToken: string; user: { role: UserRole } };
  try {
    session = await apiFetch("/auth/verify-otp", {
      method: "POST",
      body: { phone: phone.data, otp: otp.data },
      auth: false,
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return { step: "otp", phone: phone.data, error: error.message };
  }

  if (!isDashboardRole(session.user.role)) {
    return { step: "phone", phone: phone.data, error: "This phone number does not have access to the dashboard." };
  }

  await setSession(session.accessToken);
  redirect(safeNextPath(formData.get("next")));
}
