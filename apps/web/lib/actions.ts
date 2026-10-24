"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";

import { ApiError, apiAuth, apiAuthForm, apiRequest, clearToken, readToken, writeToken } from "./api";
import { listAddresses, listProducts } from "./catalog";
import { addGuestCartItem, clearGuestCart, removeGuestCartItem, updateGuestCartItem } from "./guest-cart";
import { safeNext } from "./paths";
import type { Address } from "./types";
import { cardOffer } from "./utils";
import { getSiteUrl } from "./website";

export type FormState = { error: string | null; success?: string | null };

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.code === "UNAUTHORIZED" || error.message.toLowerCase().includes("token")) {
      return "Please sign in to continue 😊";
    }
    return error.message;
  }
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
  const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
  try {
    const token = await readToken();
    if (token) {
      await apiAuth("/cart/items", { method: "POST", body: { variantId, quantity: qty } });
    } else {
      await addGuestCartItem(variantId, qty);
    }
    revalidatePath("/", "layout");
    return { error: null, success: "Item added to cart" };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCartItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = String(formData.get("id") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const qty = Number.isInteger(quantity) && quantity >= 0 ? quantity : 1;
  try {
    const token = await readToken();
    if (token && !id.startsWith("guest:")) {
      await apiAuth(`/cart/items/${encodeURIComponent(id)}`, { method: "PATCH", body: { quantity: qty } });
    } else {
      await updateGuestCartItem(variantId || id.replace(/^guest:\d+:/, ""), qty);
    }
    revalidatePath("/", "layout");
    return { error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function changeCartQuantity(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const qty = Number.isInteger(quantity) && quantity >= 0 ? quantity : 1;
  try {
    const token = await readToken();
    if (token && !id.startsWith("guest:")) {
      await apiAuth(`/cart/items/${encodeURIComponent(id)}`, { method: "PATCH", body: { quantity: qty } });
    } else {
      await updateGuestCartItem(variantId || id.replace(/^guest:\d+:/, ""), qty);
    }
    revalidatePath("/", "layout");
  } catch {}
}

export async function removeCartItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  try {
    const token = await readToken();
    if (token && !id.startsWith("guest:")) {
      await apiAuth(`/cart/items/${encodeURIComponent(id)}`, { method: "DELETE" });
    } else {
      await removeGuestCartItem(variantId || id.replace(/^guest:\d+:/, ""));
    }
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
  const token = await readToken();
  if (!token) {
    redirect(`/signin?next=${encodeURIComponent(`/p/${productId}`)}`);
  }
  try {
    if (saved) await apiAuth(`/wishlist/${encodeURIComponent(productId)}`, { method: "DELETE" });
    else await apiAuth(`/wishlist/${encodeURIComponent(productId)}`, { method: "PUT" });
    revalidatePath("/", "layout");
    revalidatePath("/account/wishlist");
  } catch (error) {
    unstable_rethrow(error);
  }
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

export async function placeDirectOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  let items: Array<{ variantId: string; quantity: number }> = [];
  const rawItems = formData.get("items");
  if (typeof rawItems === "string" && rawItems) {
    try {
      items = JSON.parse(rawItems);
    } catch {}
  }
  if (!items.length) {
    const variantId = String(formData.get("variantId") ?? "");
    const quantity = Number(formData.get("quantity") ?? 1);
    if (variantId) {
      items = [{ variantId, quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : 1 }];
    }
  }

  if (!items.length) {
    return { error: "No items selected to purchase" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const phone = phoneToE164(String(formData.get("phone") ?? ""));
  const email = String(formData.get("email") ?? "").trim();
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const addressLine2 = String(formData.get("addressLine2") ?? "").trim() || undefined;
  const landmark = String(formData.get("landmark") ?? "").trim() || undefined;
  const city = String(formData.get("city") ?? "").trim();
  const state = String(formData.get("state") ?? "").trim();
  const postalCode = String(formData.get("postalCode") ?? "").trim();
  const paymentMethod = String(formData.get("paymentMethod") ?? "COD");
  const addressId = String(formData.get("addressId") ?? "").trim() || undefined;
  const couponCode = String(formData.get("couponCode") ?? "").trim() || undefined;

  if (paymentMethod !== "COD" && paymentMethod !== "ONLINE") {
    return { error: "Choose how you want to pay (Cash on Delivery or Pay Online)" };
  }

  const token = await readToken();
  const siteUrl = await getSiteUrl();

  const body: Record<string, unknown> = {
    items,
    paymentMethod,
    returnUrl: `${siteUrl}/checkout/return`,
  };
  if (couponCode) body.couponCode = couponCode;

  if (addressId) {
    body.addressId = addressId;
  } else {
    if (!addressLine1) return { error: "Your address seems incomplete 🙏 Kindly add House/Flat No. & Street name." };
    if (!city) return { error: "Please recheck your city & state to match the PIN code ✔️" };
    if (!state) return { error: "This field is required." };
    if (!/^\d{6}$/.test(postalCode)) return { error: "Please enter a valid 6-digit PIN code to ensure smooth delivery 🚚" };

    body.address = {
      addressLine1,
      addressLine2,
      landmark,
      city,
      state,
      postalCode,
    };
  }

  if (!token) {
    if (!name) return { error: "Kindly enter your full name in English so we can deliver without confusion 😊" };
    if (!/^\+91[6-9]\d{9}$/.test(phone)) return { error: "Please enter your 10-digit active mobile number so our delivery partner can reach you 📞" };
    body.customer = {
      name,
      phone,
      email: email || undefined,
    };
  } else {
    const customerUpdate: Record<string, string> = {};
    if (name) customerUpdate.name = name;
    if (phone && /^\+91[6-9]\d{9}$/.test(phone)) customerUpdate.phone = phone;
    if (email) customerUpdate.email = email;
    if (Object.keys(customerUpdate).length > 0) {
      body.customer = customerUpdate;
    }
  }

  try {
    const result = await apiRequest<{
      order: { id: string };
      accessToken: string;
      payment: { checkoutUrl: string } | null;
    }>("/orders/direct", {
      method: "POST",
      body,
      auth: Boolean(token),
    });

    if (result.accessToken) {
      await writeToken(result.accessToken);
    }
    await clearGuestCart();
    revalidatePath("/", "layout");

    if (paymentMethod === "ONLINE" && result.payment?.checkoutUrl) {
      redirect(result.payment.checkoutUrl);
    }
    redirect(`/account/orders/${result.order.id}`);
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

export async function requestReturn(_prev: FormState, formData: FormData): Promise<FormState> {
  const orderId = String(formData.get("orderId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const rawItems = String(formData.get("items") ?? "[]");
  let items: { orderItemId: string; quantity: number }[];
  try {
    const parsed: unknown = JSON.parse(rawItems);
    if (!Array.isArray(parsed)) throw new Error("bad items");
    items = parsed.filter((item): item is { orderItemId: string; quantity: number } =>
      typeof item?.orderItemId === "string" && Number.isInteger(item.quantity) && item.quantity > 0,
    );
  } catch {
    return { error: "Choose at least one item to return." };
  }
  const photos = formData.getAll("photos").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (!orderId || items.length === 0) return { error: "Choose at least one item to return." };
  if (!new Set(["DAMAGED", "WRONG_ITEM", "MISSING", "EXPIRED", "OTHER"]).has(reason)) return { error: "Choose a return reason." };
  if (reason === "OTHER" && !note) return { error: "Describe the reason for this return." };
  if (photos.length > 3) return { error: "Upload up to 3 photos." };
  if (photos.some((photo) => !photo.type.startsWith("image/") || photo.size > 10 * 1024 * 1024)) {
    return { error: "Each photo must be an image under 10 MB." };
  }

  try {
    const photoUrls: string[] = [];
    for (const photo of photos) {
      const upload = new FormData();
      upload.append("file", photo, photo.name);
      const saved = await apiAuthForm<{ url: string }>(`/orders/${encodeURIComponent(orderId)}/returns/photos`, upload);
      photoUrls.push(saved.url);
    }
    await apiAuth(`/orders/${encodeURIComponent(orderId)}/returns`, {
      method: "POST",
      body: { reason, note: note || undefined, items, photoUrls },
    });
    revalidatePath(`/account/orders/${orderId}`);
    revalidatePath("/account/orders");
    return { error: null, success: "Return request submitted." };
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

export type SearchSuggestion = {
  productId: string;
  name: string;
  slug: string;
  categoryName: string;
  brandName: string | null;
  imageUrl: string | null;
  price: string;
  compareAtPrice: string | null;
  inStock: boolean;
};

export async function searchSuggestions(query: string): Promise<SearchSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];
  try {
    const page = await listProducts({ search: trimmed, pageSize: 6 });
    return page.items.map((p) => {
      const offer = p.variants.length > 0 ? cardOffer(p.variants) : null;
      return {
        productId: p.productId,
        name: p.name,
        slug: p.slug,
        categoryName: p.category.name,
        brandName: p.brand?.name ?? null,
        imageUrl: p.imageUrl,
        price: offer ? offer.price : (p.variants[0]?.price ?? "0.00"),
        compareAtPrice: offer?.compareAtPrice ?? null,
        inStock: offer ? offer.inStock : (p.variants[0]?.inStock ?? true),
      };
    });
  } catch {
    return [];
  }
}

export type PhoneLookupResult = {
  exists: boolean;
  requireOtp: boolean;
  hasSavedAddresses: boolean;
  name: string | null;
};

export async function lookupCheckoutPhone(phoneInput: string): Promise<PhoneLookupResult> {
  const phone = phoneToE164(phoneInput);
  try {
    return await apiRequest<PhoneLookupResult>("/auth/lookup-phone", {
      method: "POST",
      body: { phone },
    });
  } catch {
    return { exists: false, requireOtp: false, hasSavedAddresses: false, name: null };
  }
}

export async function sendCheckoutOtp(phoneInput: string): Promise<{ success: boolean; error?: string; devOtp?: string }> {
  const phone = phoneToE164(phoneInput);
  try {
    const res = await apiRequest<{ message?: string; expiresInSeconds?: number; devOtp?: string }>("/auth/send-otp", {
      method: "POST",
      body: { phone },
    });
    if (res.devOtp) {
      console.log(`\n=======================================================\n🔑 [DEV OTP] Verification code for ${phone} is: ${res.devOtp}\n=======================================================\n`);
    }
    return { success: true, devOtp: res.devOtp };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}

export async function verifyCheckoutOtp(
  phoneInput: string,
  otp: string,
): Promise<{
  success: boolean;
  error?: string;
  user?: { id: string; name: string | null; phone: string; email?: string | null };
  addresses?: Address[];
}> {
  const phone = phoneToE164(phoneInput);
  try {
    const result = await apiRequest<{
      accessToken: string;
      user: { id: string; name: string | null; phone: string; email?: string | null };
    }>("/auth/verify-otp", { method: "POST", body: { phone, otp: otp.trim() } });

    await writeToken(result.accessToken);
    const addressResult = await listAddresses().catch(() => ({ items: [] }));
    return { success: true, user: result.user, addresses: addressResult.items };
  } catch (err) {
    return { success: false, error: errorMessage(err) };
  }
}
