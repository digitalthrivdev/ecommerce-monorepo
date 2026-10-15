"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { ApiError, apiAuth, apiRequest, clearToken, writeToken } from "./api";
import { safeNext } from "./paths";
import { getSiteUrl } from "./website";

export type FormState = { error: string | null };

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  return "Something went wrong. Please try again.";
}

async function fail(error: unknown): Promise<FormState> {
  unstable_rethrow(error);
  if (error instanceof ApiError && error.status === 401) await clearToken();
  return { error: errorMessage(error) };
}

function phoneToE164(input: string) {
  const trimmed = input.trim().replace(/[\s-]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (/^[6-9]\d{9}$/.test(trimmed)) return `+91${trimmed}`;
  return trimmed;
}

export type SignInState = { error: string | null; step: "phone" | "otp"; phone: string };

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const next = safeNext(String(formData.get("next") ?? ""));
  const phone = phoneToE164(String(formData.get("phone") ?? ""));
  const step = String(formData.get("step") ?? "phone");

  try {
    if (step === "otp") {
      const otp = String(formData.get("otp") ?? "").trim();
      const result = await apiRequest<{ accessToken: string }>("/auth/verify-otp", { method: "POST", body: { phone, otp } });
      await writeToken(result.accessToken);
      redirect(next);
    }
    await apiRequest("/auth/send-otp", { method: "POST", body: { phone } });
    return { error: null, step: "otp", phone };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error), step: step === "otp" ? "otp" : "phone", phone };
  }
}

export async function signOut() {
  try {
    await apiAuth("/auth/logout", { method: "POST" });
  } catch {
    // The cookie is cleared either way.
  }
  await clearToken();
  redirect("/");
}

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const body: { name?: string; email?: string } = {};
  if (name) body.name = name;
  if (email) body.email = email;
  try {
    await apiAuth("/users/me", { method: "PATCH", body });
    revalidatePath("/account");
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function addToCart(_prev: FormState, formData: FormData): Promise<FormState> {
  const variantId = String(formData.get("variantId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  try {
    await apiAuth("/cart/items", { method: "POST", body: { variantId, quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1 } });
    revalidatePath("/", "layout");
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCartItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  try {
    await apiAuth(`/cart/items/${encodeURIComponent(id)}`, { method: "PATCH", body: { quantity } });
    revalidatePath("/", "layout");
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function removeCartItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  try {
    await apiAuth(`/cart/items/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (error) {
    unstable_rethrow(error);
  }
  revalidatePath("/", "layout");
}

export async function applyCoupon(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  try {
    await apiAuth("/cart/coupon", { method: "PUT", body: { code } });
    revalidatePath("/cart");
    revalidatePath("/checkout");
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function removeCoupon() {
  await apiAuth("/cart/coupon", { method: "DELETE" });
  revalidatePath("/cart");
  revalidatePath("/checkout");
}

export async function saveWishlist(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const saved = String(formData.get("saved") ?? "") === "true";
  if (saved) await apiAuth(`/wishlist/${encodeURIComponent(productId)}`, { method: "DELETE" });
  else await apiAuth(`/wishlist/${encodeURIComponent(productId)}`, { method: "PUT" });
  revalidatePath("/", "layout");
  revalidatePath("/account/wishlist");
}

export async function saveAddress(_prev: FormState, formData: FormData): Promise<FormState> {
  const empty = (name: string) => {
    const value = String(formData.get(name) ?? "").trim();
    return value ? value : null;
  };
  const body = {
    label: empty("label"),
    name: String(formData.get("name") ?? "").trim(),
    phone: phoneToE164(String(formData.get("phone") ?? "")),
    addressLine1: String(formData.get("addressLine1") ?? "").trim(),
    addressLine2: empty("addressLine2"),
    landmark: empty("landmark"),
    city: String(formData.get("city") ?? "").trim(),
    state: String(formData.get("state") ?? "").trim(),
    postalCode: String(formData.get("postalCode") ?? "").trim(),
    isDefault: formData.get("isDefault") === "on",
  };
  const id = String(formData.get("id") ?? "");
  const next = safeNext(String(formData.get("next") ?? "/account/addresses"));
  try {
    if (id) await apiAuth(`/users/me/addresses/${encodeURIComponent(id)}`, { method: "PATCH", body });
    else await apiAuth("/users/me/addresses", { method: "POST", body });
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
  redirect(next);
}

export async function deleteAddress(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await apiAuth(`/users/me/addresses/${encodeURIComponent(id)}`, { method: "DELETE" });
  revalidatePath("/account/addresses");
  revalidatePath("/checkout");
}

export async function placeOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const addressId = String(formData.get("addressId") ?? "");
  const paymentMethod = String(formData.get("paymentMethod") ?? "");
  if (paymentMethod !== "COD" && paymentMethod !== "ONLINE") return { error: "Choose how you want to pay" };
  try {
    const order = await apiAuth<{ id: string }>("/orders", { method: "POST", body: { addressId, paymentMethod } });
    revalidatePath("/", "layout");
    if (paymentMethod === "ONLINE") {
      const siteUrl = await getSiteUrl();
      const session = await apiAuth<{ checkoutUrl: string }>(`/orders/${encodeURIComponent(order.id)}/payment`, {
        method: "POST",
        body: { returnUrl: `${siteUrl}/checkout/return` },
      });
      redirect(session.checkoutUrl);
    }
    redirect(`/account/orders/${order.id}`);
  } catch (error) {
    return fail(error);
  }
}

export async function payOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("orderId") ?? "");
  try {
    const siteUrl = await getSiteUrl();
    const session = await apiAuth<{ checkoutUrl: string }>(`/orders/${encodeURIComponent(id)}/payment`, {
      method: "POST",
      body: { returnUrl: `${siteUrl}/checkout/return` },
    });
    redirect(session.checkoutUrl);
  } catch (error) {
    return fail(error);
  }
}

export async function cancelOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  try {
    await apiAuth(`/orders/${encodeURIComponent(id)}/cancel`, { method: "POST", body: reason ? { reason } : {} });
    revalidatePath(`/account/orders/${id}`);
    revalidatePath("/account/orders");
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function reviewProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const productId = String(formData.get("productId") ?? "");
  const rating = Number(formData.get("rating") ?? 0);
  const comment = String(formData.get("comment") ?? "").trim();
  const orderId = String(formData.get("orderId") ?? "");
  try {
    await apiAuth(`/products/${encodeURIComponent(productId)}/review`, {
      method: "PUT",
      body: { rating, comment: comment || null },
    });
    revalidatePath(`/p/${productId}`);
    if (orderId) revalidatePath(`/account/orders/${orderId}`);
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

export type PincodeState = { error: string | null; result: { serviceable: boolean; codAvailable: boolean; etaDays: number | null } | null };

export async function checkPincode(_prev: PincodeState, formData: FormData): Promise<PincodeState> {
  const pincode = String(formData.get("pincode") ?? "").trim();
  try {
    const result = await apiRequest<{ serviceable: boolean; codAvailable: boolean; etaDays: number | null }>(
      `/serviceability?pincode=${encodeURIComponent(pincode)}&weightGrams=0&cod=true`,
      { revalidate: 300 },
    );
    return { error: null, result };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error), result: null };
  }
}
