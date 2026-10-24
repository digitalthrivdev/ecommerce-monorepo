"use client";

import { ArrowLeft, CheckCircle2, Hash, KeyRound, Loader2, MapPin, Phone, RefreshCw, User } from "lucide-react";
import { useActionState, useEffect, useState } from "react";

import { placeDirectOrder, sendCheckoutOtp, verifyCheckoutOtp } from "@/lib/actions";
import { INDIAN_STATES } from "@/lib/indian-states";
import type { Address } from "@/lib/types";
import { cn, formatMoney } from "@/lib/utils";
import { SubmitButton } from "./action-form";

export type DirectCheckoutItem = {
  variantId: string;
  name: string;
  variantLabel?: string | null;
  imageUrl?: string | null;
  price: string;
  quantity: number;
};

export type DirectCheckoutAddress = {
  id: string;
  label?: string | null;
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  postalCode: string;
  isDefault?: boolean;
};

type Props = {
  items: DirectCheckoutItem[];
  currency: string;
  defaultCustomer?: { name?: string | null; phone?: string | null; email?: string | null } | null;
  savedAddresses?: Array<DirectCheckoutAddress>;
  showItemHeader?: boolean;
};

function isValidEnglishName(val: string): boolean {
  const trimmed = val.trim();
  if (trimmed.length < 2) return false;
  return /^[A-Za-z\s.'-]+$/.test(trimmed) && /[A-Za-z]/.test(trimmed);
}

export function DirectCheckoutForm({
  items,
  currency,
  defaultCustomer,
  savedAddresses = [],
  showItemHeader = true,
}: Props) {
  const [state, formAction, pending] = useActionState(placeDirectOrder, { error: null });
  const [localSavedAddresses, setLocalSavedAddresses] = useState<DirectCheckoutAddress[]>(savedAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    savedAddresses.length > 0 ? savedAddresses[0]!.id : "",
  );
  const [isNewAddress, setIsNewAddress] = useState(savedAddresses.length === 0);
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "ONLINE">("COD");
  const [showEmail, setShowEmail] = useState(Boolean(defaultCustomer?.email));

  // 2-Step State: Step 1 (Phone & OTP) or Step 2 (Delivery & Payment)
  const [step, setStep] = useState<1 | 2>(defaultCustomer?.phone ? 2 : 1);

  const [name, setName] = useState(defaultCustomer?.name ?? "");
  const [phone, setPhone] = useState(defaultCustomer?.phone ? defaultCustomer.phone.replace(/^\+91/, "") : "");
  const [email, setEmail] = useState(defaultCustomer?.email ?? "");
  const [addressLine1, setAddressLine1] = useState("");
  const [landmark, setLandmark] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [city, setCity] = useState("");

  // Step 1: OTP states
  const [isVerified, setIsVerified] = useState(Boolean(defaultCustomer));
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (defaultCustomer?.phone) {
      setStep(2);
      setIsVerified(true);
      if (defaultCustomer.name && !name) setName(defaultCustomer.name);
      if (defaultCustomer.email && !email) setEmail(defaultCustomer.email);
    }
  }, [defaultCustomer]);

  useEffect(() => {
    if (savedAddresses.length > 0 && !selectedAddressId) {
      setSelectedAddressId(savedAddresses[0]!.id);
      setIsNewAddress(false);
    }
  }, [savedAddresses, selectedAddressId]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const totalAmount = items.reduce((sum, it) => sum + Number(it.price) * it.quantity, 0).toFixed(2);
  const primaryItem = items[0]!;

  async function handleSendOtp() {
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) {
      setOtpError("Please enter a valid 10-digit mobile number");
      return;
    }

    setOtpSending(true);
    setOtpError(null);
    try {
      const res = await sendCheckoutOtp(cleanPhone);
      if (!res.success) {
        setOtpError(res.error || "Failed to send OTP");
        return;
      }
      setOtpSent(true);
      if (res.devOtp) {
        setDevOtp(res.devOtp);
        console.log(`\n=======================================================\n🔑 [DEV OTP] Code for +91${cleanPhone}: ${res.devOtp}\n=======================================================\n`);
      }
      setResendCooldown(30);
    } catch (err: any) {
      setOtpError(err?.message || "Failed to send OTP");
    } finally {
      setOtpSending(false);
    }
  }

  async function handleVerifyOtp() {
    if (otpCode.length < 6) return;
    setOtpLoading(true);
    setOtpError(null);
    try {
      const cleanPhone = phone.replace(/\D/g, "");
      const result = await verifyCheckoutOtp(cleanPhone, otpCode);
      if (!result.success || !result.user) {
        setOtpError(result.error || "Invalid OTP code");
        return;
      }
      setIsVerified(true);
      if (result.user.name && !name) {
        setName(result.user.name);
      }
      if (result.user.email && !email) {
        setEmail(result.user.email);
      }
      if (result.addresses && result.addresses.length > 0) {
        setLocalSavedAddresses(result.addresses);
        setSelectedAddressId(result.addresses[0]!.id);
        setIsNewAddress(false);
      }
      setStep(2);
    } catch (err: any) {
      setOtpError(err?.message || "Failed to verify OTP");
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleResendOtp() {
    setOtpSending(true);
    setOtpError(null);
    try {
      const cleanPhone = phone.replace(/\D/g, "");
      const res = await sendCheckoutOtp(cleanPhone);
      if (!res.success) {
        setOtpError(res.error || "Failed to resend OTP");
        return;
      }
      if (res.devOtp) {
        setDevOtp(res.devOtp);
        console.log(`\n=======================================================\n🔑 [DEV OTP] Resent code for +91${cleanPhone}: ${res.devOtp}\n=======================================================\n`);
      }
      setResendCooldown(30);
    } catch (err: any) {
      setOtpError(err?.message || "Failed to resend OTP");
    } finally {
      setOtpSending(false);
    }
  }

  function validateField(field: string, val: string): string | null {
    switch (field) {
      case "name":
        if (!val.trim() || !isValidEnglishName(val)) {
          return "Kindly enter your full name in English so we can deliver without confusion 😊";
        }
        return null;
      case "phone":
        if (!/^[6-9]\d{9}$/.test(val.replace(/\D/g, ""))) {
          return "Please enter your 10-digit active mobile number so our delivery partner can reach you 📞";
        }
        return null;
      case "addressLine1":
        if (!val.trim() || val.trim().length < 5) {
          return "Your address seems incomplete 🙏 Kindly add House/Flat No. & Street name.";
        }
        return null;
      case "landmark":
        if (!val.trim()) {
          return "Adding a nearby landmark helps our delivery partner find you faster 🏠";
        }
        return null;
      case "postalCode":
        if (!/^[1-9]\d{5}$/.test(val.trim())) {
          return "Please enter a valid 6-digit PIN code to ensure smooth delivery 🚚";
        }
        return null;
      case "state":
        if (!val.trim()) {
          return "This field is required.";
        }
        return null;
      case "city":
        if (!val.trim() || val.trim().length < 2) {
          return "Please recheck your city & state to match the PIN code ✔️";
        }
        return null;
      case "email":
        if (val.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
          return "Please enter a valid email address.";
        }
        return null;
      default:
        return null;
    }
  }

  const handleFieldChange = (field: string, val: string) => {
    if (touched[field]) {
      const err = validateField(field, val);
      setErrors((prev) => {
        const next = { ...prev };
        if (err) next[field] = err;
        else delete next[field];
        return next;
      });
    }
  };

  const handleFieldBlur = (field: string, val: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const err = validateField(field, val);
    setErrors((prev) => {
      const next = { ...prev };
      if (err) next[field] = err;
      else delete next[field];
      return next;
    });
  };

  const hasError = (field: string) => Boolean(touched[field] && errors[field]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    const cleanPhone = phone.replace(/\D/g, "");
    const newErrors: Record<string, string> = {};

    if (isNewAddress || !selectedAddressId) {
      const nameErr = validateField("name", name);
      if (nameErr) newErrors.name = nameErr;

      const addrErr = validateField("addressLine1", addressLine1);
      if (addrErr) newErrors.addressLine1 = addrErr;

      const landmarkErr = validateField("landmark", landmark);
      if (landmarkErr) newErrors.landmark = landmarkErr;

      const pinErr = validateField("postalCode", postalCode);
      if (pinErr) newErrors.postalCode = pinErr;

      const stateErr = validateField("state", selectedState);
      if (stateErr) newErrors.state = stateErr;

      const cityErr = validateField("city", city);
      if (cityErr) newErrors.city = cityErr;
    }

    if (showEmail && email.trim()) {
      const emailErr = validateField("email", email);
      if (emailErr) newErrors.email = emailErr;
    }

    setTouched({
      name: true,
      phone: true,
      addressLine1: true,
      landmark: true,
      postalCode: true,
      state: true,
      city: true,
      email: true,
    });
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      e.preventDefault();
    }
  };

  return (
    <div className="space-y-4">
      {/* Step Progress Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          {step === 2 && !defaultCustomer?.phone && (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="mr-1 rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              title="Go back to step 1"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <span className="text-sm font-bold text-gray-900">
            {step === 1 ? "Step 1 of 2: Mobile Number" : "Step 2 of 2: Delivery & Payment"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={cn("h-1.5 w-8 rounded-full", step >= 1 ? "bg-primary" : "bg-gray-200")} />
          <div className={cn("h-1.5 w-8 rounded-full", step >= 2 ? "bg-primary" : "bg-gray-200")} />
        </div>
      </div>

      {/* Item preview card */}
      {showItemHeader && (
        <div className="flex items-center gap-3 rounded-xl border bg-gray-50/70 p-3">
          <div className="relative size-12 shrink-0 overflow-hidden rounded-lg border bg-white">
            <span className="absolute left-0.5 top-0.5 z-10 flex size-4 items-center justify-center rounded-full bg-black text-[9px] font-bold text-white">
              {primaryItem.quantity}
            </span>
            {primaryItem.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={primaryItem.imageUrl}
                alt={primaryItem.name}
                className="size-full object-contain p-1"
              />
            ) : (
              <div className="flex size-full items-center justify-center font-bold text-primary">
                {primaryItem.name.charAt(0)}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-gray-900">{primaryItem.name}</p>
            <p className="truncate text-[11px] text-gray-500">
              {items.length === 1 ? primaryItem.variantLabel || primaryItem.name : `${items.length} items`}
            </p>
          </div>
          <p className="text-sm font-extrabold text-gray-900">{formatMoney(totalAmount, currency)}</p>
        </div>
      )}

      {/* Global Form Error */}
      {state?.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
          {state.error}
        </div>
      )}

      {/* ================= STEP 1: MOBILE NUMBER & OTP ================= */}
      {step === 1 && (
        <div className="space-y-4 pt-1">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-gray-900">Enter your mobile number</h3>
            <p className="text-xs text-gray-500">
              We&apos;ll send a 6-digit OTP to verify your phone number before taking delivery details.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="checkout-phone" className="block text-xs font-semibold text-gray-700">
              10-Digit Mobile Number <span className="text-red-500">*</span>
            </label>
            <div
              className={cn(
                "flex h-11 items-center overflow-hidden rounded-xl border bg-white transition focus-within:ring-2 focus-within:ring-primary/20",
                hasError("phone") ? "border-red-500 ring-2 ring-red-100" : "border-gray-300 focus-within:border-primary",
              )}
            >
              <span className="flex h-full items-center border-r bg-gray-50 px-3 text-sm font-bold text-gray-700">
                +91
              </span>
              <input
                id="checkout-phone"
                type="tel"
                value={phone}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/\D/g, "");
                  setPhone(cleaned);
                  setOtpSent(false);
                  setOtpCode("");
                  setOtpError(null);
                  handleFieldChange("phone", cleaned);
                }}
                onBlur={() => handleFieldBlur("phone", phone)}
                placeholder="98765 43210"
                maxLength={10}
                autoFocus
                className="size-full px-3 text-sm font-semibold tracking-wider text-gray-900 outline-none"
              />
            </div>
            {hasError("phone") && <p className="text-[11px] font-medium text-red-600">{errors.phone}</p>}
          </div>

          {!otpSent ? (
            <button
              type="button"
              disabled={otpSending || phone.replace(/\D/g, "").length !== 10}
              onClick={handleSendOtp}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {otpSending ? <Loader2 className="size-4 animate-spin" /> : "Get OTP to Continue"}
            </button>
          ) : (
            <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-4 text-primary" />
                  <span className="text-xs font-bold text-primary">Enter Verification Code</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtpCode("");
                    setOtpError(null);
                  }}
                  className="text-xs font-semibold text-gray-500 underline hover:text-gray-900"
                >
                  Change number
                </button>
              </div>

              <p className="text-xs text-gray-600">
                Enter the 6-digit OTP sent to <strong className="text-gray-900">+91 {phone}</strong>
              </p>

              {devOtp && (
                <button
                  type="button"
                  onClick={() => setOtpCode(devOtp)}
                  className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/20"
                >
                  <span>🔑 Dev Mode OTP: {devOtp}</span>
                  <span className="text-[11px] font-normal text-gray-500">(Click to auto-fill)</span>
                </button>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/\D/g, "");
                    setOtpCode(cleaned);
                    setOtpError(null);
                  }}
                  placeholder="6-digit OTP"
                  maxLength={6}
                  autoFocus
                  className="h-11 flex-1 rounded-lg border border-gray-300 bg-white px-3 text-center text-lg font-bold tracking-widest text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  disabled={otpLoading || otpCode.length < 6}
                  onClick={handleVerifyOtp}
                  className="flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {otpLoading ? <Loader2 className="size-4 animate-spin" /> : "Verify & Proceed"}
                </button>
              </div>

              {otpError && <p className="text-xs font-medium text-red-600">{otpError}</p>}

              <div className="flex items-center justify-between pt-1 text-xs text-gray-500">
                <span>Didn&apos;t receive code?</span>
                <button
                  type="button"
                  disabled={otpSending || resendCooldown > 0}
                  onClick={handleResendOtp}
                  className="font-semibold text-primary underline hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {otpSending ? "Sending..." : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= STEP 2: DELIVERY DETAILS & PAYMENT ================= */}
      {step === 2 && (
        <form action={formAction} onSubmit={handleSubmit} className="space-y-4 pt-1">
          {/* Hidden metadata for submission */}
          <input type="hidden" name="items" value={JSON.stringify(items.map((it) => ({ variantId: it.variantId, quantity: it.quantity })))} />
          <input type="hidden" name="paymentMethod" value={paymentMethod} />
          <input type="hidden" name="phone" value={phone} />

          {/* Verified Phone Chip */}
          <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" />
              <span className="text-xs font-bold text-primary">Verified Phone: +91 {phone}</span>
            </div>
            {!defaultCustomer?.phone && (
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setOtpSent(false);
                }}
                className="text-xs font-semibold text-gray-500 underline hover:text-gray-900"
              >
                Change
              </button>
            )}
          </div>

          {/* Saved Addresses for Returning Customer */}
          {localSavedAddresses.length > 0 && (
            <div className="space-y-2 rounded-xl bg-gray-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Delivering To</p>
              <div className="space-y-2">
                {localSavedAddresses.map((addr) => {
                  const isSelected = !isNewAddress && selectedAddressId === addr.id;
                  return (
                    <label
                      key={addr.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition",
                        isSelected ? "border-primary bg-primary/5" : "border-gray-200 bg-white hover:border-gray-300",
                      )}
                    >
                      <input
                        type="radio"
                        name="addressSelection"
                        checked={isSelected}
                        onChange={() => {
                          setSelectedAddressId(addr.id);
                          setIsNewAddress(false);
                        }}
                        className="mt-0.5 size-4 text-primary focus:ring-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-900">
                          {addr.label || addr.name} · {addr.phone}
                        </p>
                        <p className="text-xs text-gray-500">
                          {addr.addressLine1}, {addr.city}, {addr.state} {addr.postalCode}
                        </p>
                      </div>
                    </label>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setIsNewAddress(true)}
                  className={cn(
                    "block w-full pt-1 text-left text-xs font-bold transition hover:opacity-80",
                    isNewAddress ? "text-primary" : "text-gray-500",
                  )}
                >
                  + Deliver to a different address
                </button>
              </div>
            </div>
          )}

          {/* Pass addressId if selected */}
          {!isNewAddress && selectedAddressId && (
            <input type="hidden" name="addressId" value={selectedAddressId} />
          )}

          {/* Manual Address Form */}
          {(isNewAddress || localSavedAddresses.length === 0) && (
            <div className="space-y-3">
              {/* Full Name */}
              <div className="space-y-1">
                <label htmlFor="checkout-name" className="block text-xs font-semibold text-gray-700">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div
                  className={cn(
                    "flex h-11 items-center overflow-hidden rounded-xl border bg-white transition focus-within:ring-2 focus-within:ring-primary/20",
                    hasError("name") ? "border-red-500 ring-2 ring-red-100" : "border-gray-300 focus-within:border-primary",
                  )}
                >
                  <span className="flex h-full w-11 items-center justify-center border-r bg-gray-50 text-gray-400">
                    <User className="size-4" />
                  </span>
                  <input
                    id="checkout-name"
                    name="name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      handleFieldChange("name", e.target.value);
                    }}
                    onBlur={() => handleFieldBlur("name", name)}
                    placeholder="Full Name (in English)"
                    className="size-full px-3 text-sm text-gray-900 outline-none"
                  />
                </div>
                {hasError("name") && <p className="text-[11px] font-medium text-red-600">{errors.name}</p>}
              </div>

              {/* Address Line 1 */}
              <div className="space-y-1">
                <label htmlFor="checkout-address1" className="block text-xs font-semibold text-gray-700">
                  House / Flat No., Building, Street <span className="text-red-500">*</span>
                </label>
                <div
                  className={cn(
                    "flex h-11 items-center overflow-hidden rounded-xl border bg-white transition focus-within:ring-2 focus-within:ring-primary/20",
                    hasError("addressLine1") ? "border-red-500 ring-2 ring-red-100" : "border-gray-300 focus-within:border-primary",
                  )}
                >
                  <span className="flex h-full w-11 items-center justify-center border-r bg-gray-50 text-gray-400">
                    <MapPin className="size-4" />
                  </span>
                  <input
                    id="checkout-address1"
                    name="addressLine1"
                    type="text"
                    value={addressLine1}
                    onChange={(e) => {
                      setAddressLine1(e.target.value);
                      handleFieldChange("addressLine1", e.target.value);
                    }}
                    onBlur={() => handleFieldBlur("addressLine1", addressLine1)}
                    placeholder="e.g. Flat 402, Sunshine Apts, MG Road"
                    className="size-full px-3 text-sm text-gray-900 outline-none"
                  />
                </div>
                {hasError("addressLine1") && <p className="text-[11px] font-medium text-red-600">{errors.addressLine1}</p>}
              </div>

              {/* Landmark */}
              <div className="space-y-1">
                <label htmlFor="checkout-landmark" className="block text-xs font-semibold text-gray-700">
                  Nearby Landmark <span className="text-red-500">*</span>
                </label>
                <div
                  className={cn(
                    "flex h-11 items-center overflow-hidden rounded-xl border bg-white transition focus-within:ring-2 focus-within:ring-primary/20",
                    hasError("landmark") ? "border-red-500 ring-2 ring-red-100" : "border-gray-300 focus-within:border-primary",
                  )}
                >
                  <span className="flex h-full w-11 items-center justify-center border-r bg-gray-50 text-gray-400">
                    <MapPin className="size-4" />
                  </span>
                  <input
                    id="checkout-landmark"
                    name="landmark"
                    type="text"
                    value={landmark}
                    onChange={(e) => {
                      setLandmark(e.target.value);
                      handleFieldChange("landmark", e.target.value);
                    }}
                    onBlur={() => handleFieldBlur("landmark", landmark)}
                    placeholder="e.g. Near City Hospital"
                    className="size-full px-3 text-sm text-gray-900 outline-none"
                  />
                </div>
                {hasError("landmark") && <p className="text-[11px] font-medium text-red-600">{errors.landmark}</p>}
              </div>

              {/* PIN Code */}
              <div className="space-y-1">
                <label htmlFor="checkout-pin" className="block text-xs font-semibold text-gray-700">
                  6-Digit PIN Code <span className="text-red-500">*</span>
                </label>
                <div
                  className={cn(
                    "flex h-11 items-center overflow-hidden rounded-xl border bg-white transition focus-within:ring-2 focus-within:ring-primary/20",
                    hasError("postalCode") ? "border-red-500 ring-2 ring-red-100" : "border-gray-300 focus-within:border-primary",
                  )}
                >
                  <span className="flex h-full w-11 items-center justify-center border-r bg-gray-50 text-gray-400">
                    <Hash className="size-4" />
                  </span>
                  <input
                    id="checkout-pin"
                    name="postalCode"
                    type="text"
                    value={postalCode}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/\D/g, "");
                      setPostalCode(cleaned);
                      handleFieldChange("postalCode", cleaned);
                    }}
                    onBlur={() => handleFieldBlur("postalCode", postalCode)}
                    placeholder="6-digit PIN code"
                    maxLength={6}
                    className="size-full px-3 text-sm text-gray-900 outline-none"
                  />
                </div>
                {hasError("postalCode") && <p className="text-[11px] font-medium text-red-600">{errors.postalCode}</p>}
              </div>

              {/* State Dropdown */}
              <div className="space-y-1">
                <label htmlFor="checkout-state" className="block text-xs font-semibold text-gray-700">
                  State <span className="text-red-500">*</span>
                </label>
                <div
                  className={cn(
                    "flex h-11 items-center overflow-hidden rounded-xl border bg-white transition focus-within:ring-2 focus-within:ring-primary/20",
                    hasError("state") ? "border-red-500 ring-2 ring-red-100" : "border-gray-300 focus-within:border-primary",
                  )}
                >
                  <select
                    id="checkout-state"
                    name="state"
                    value={selectedState}
                    onChange={(e) => {
                      setSelectedState(e.target.value);
                      handleFieldChange("state", e.target.value);
                    }}
                    onBlur={() => handleFieldBlur("state", selectedState)}
                    className="size-full bg-transparent px-3 text-sm text-gray-900 outline-none"
                  >
                    <option value="">Select State</option>
                    {INDIAN_STATES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                {hasError("state") && <p className="text-[11px] font-medium text-red-600">{errors.state}</p>}
              </div>

              {/* City */}
              <div className="space-y-1">
                <label htmlFor="checkout-city" className="block text-xs font-semibold text-gray-700">
                  City <span className="text-red-500">*</span>
                </label>
                <div
                  className={cn(
                    "flex h-11 items-center overflow-hidden rounded-xl border bg-white transition focus-within:ring-2 focus-within:ring-primary/20",
                    hasError("city") ? "border-red-500 ring-2 ring-red-100" : "border-gray-300 focus-within:border-primary",
                  )}
                >
                  <span className="flex h-full w-11 items-center justify-center border-r bg-gray-50 text-gray-400">
                    <MapPin className="size-4" />
                  </span>
                  <input
                    id="checkout-city"
                    name="city"
                    type="text"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      handleFieldChange("city", e.target.value);
                    }}
                    onBlur={() => handleFieldBlur("city", city)}
                    placeholder="City name"
                    className="size-full px-3 text-sm text-gray-900 outline-none"
                  />
                </div>
                {hasError("city") && <p className="text-[11px] font-medium text-red-600">{errors.city}</p>}
              </div>
            </div>
          )}

          {/* Optional Email toggle */}
          {!showEmail ? (
            <button
              type="button"
              onClick={() => setShowEmail(true)}
              className="text-xs font-semibold text-primary underline hover:opacity-80"
            >
              + Add email address (for order updates)
            </button>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor="checkout-email" className="block text-xs font-semibold text-gray-700">
                  Email (optional)
                </label>
                <button
                  type="button"
                  onClick={() => setShowEmail(false)}
                  className="text-xs text-gray-500 underline hover:text-gray-700"
                >
                  Remove
                </button>
              </div>
              <input
                id="checkout-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  handleFieldChange("email", e.target.value);
                }}
                onBlur={() => handleFieldBlur("email", email)}
                placeholder="name@example.com"
                className="h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              {hasError("email") && <p className="text-[11px] font-medium text-red-600">{errors.email}</p>}
            </div>
          )}

          {/* Payment Method Selector */}
          <div className="space-y-1.5 pt-2">
            <span className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Select Payment Option
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod("COD")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border p-3.5 text-xs font-bold transition",
                  paymentMethod === "COD"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                )}
              >
                Cash on Delivery
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("ONLINE")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border p-3.5 text-xs font-bold transition",
                  paymentMethod === "ONLINE"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
                )}
              >
                Pay Online
              </button>
            </div>
          </div>

          {/* Trust Badge */}
          <div className="flex items-center justify-center rounded-xl bg-gray-50 py-2.5 text-center text-xs text-gray-500">
            🔒 100% Secure Checkout · Safe & Verified
          </div>

          {/* Submit Button */}
          <SubmitButton
            disabled={pending}
            className="h-14 w-full rounded-xl bg-primary text-base font-extrabold text-primary-foreground shadow-md transition hover:opacity-95"
          >
            {pending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : paymentMethod === "COD" ? (
              `Place Order · ${formatMoney(totalAmount, currency)}`
            ) : (
              `Pay & Order · ${formatMoney(totalAmount, currency)}`
            )}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
