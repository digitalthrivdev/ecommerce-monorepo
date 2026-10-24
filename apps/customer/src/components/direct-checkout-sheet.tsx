import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router } from "expo-router";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CreditCard,
  Hash,
  KeyRound,
  MapPin,
  User,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StatePicker } from "@/components/state-picker";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAddresses } from "@/lib/addresses";
import { apiFetch, errorMessage } from "@/lib/api";
import { useAppTheme } from "@/lib/app-theme";
import { CART_KEY, clearGuestCart } from "@/lib/cart";
import { formatMoney } from "@/lib/format";
import { smallImage } from "@/lib/images";
import { useSession } from "@/lib/session";
import { useSettings } from "@/lib/settings";
import type { OrderDetail, PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";

export type DirectItem = {
  variantId: string;
  name: string;
  variantLabel?: string | null;
  imageUrl?: string | null;
  price: string;
  quantity: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  items: DirectItem[];
};

function isValidEnglishName(val: string): boolean {
  const trimmed = val.trim();
  if (trimmed.length < 2) return false;
  return /^[A-Za-z\s.'-]+$/.test(trimmed) && /[A-Za-z]/.test(trimmed);
}

export function DirectCheckoutSheet({ visible, onClose, items }: Props) {
  const insets = useSafeAreaInsets();
  const { colors, neutral } = useAppTheme();
  const { currency } = useSettings();
  const { user, signIn } = useSession();
  const queryClient = useQueryClient();
  const { demoLogins } = useSettings();

  const addressesQuery = useAddresses();
  const savedAddresses = addressesQuery.data ?? [];
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [isNewAddress, setIsNewAddress] = useState(savedAddresses.length === 0);

  // 2-Step State: Step 1 (Phone & OTP) or Step 2 (Delivery & Payment)
  const [step, setStep] = useState<1 | 2>(user ? 2 : 1);

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ? user.phone.replace(/^\+91/, "") : "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [showEmail, setShowEmail] = useState(Boolean(user?.email));
  const [addressLine1, setAddressLine1] = useState("");
  const [landmark, setLandmark] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");

  // Step 1: OTP states
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (!visible || items.length === 0) return null;

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
      const res = await apiFetch<{ message: string; expiresInSeconds?: number; devOtp?: string }>("/auth/send-otp", {
        method: "POST",
        body: { phone: `+91${cleanPhone}` },
      });

      setOtpSent(true);
      if (res.devOtp) {
        setDevOtp(res.devOtp);
        setOtpCode(res.devOtp);
        console.log(`\n=======================================================\n🔑 [DEV OTP] Code for +91${cleanPhone}: ${res.devOtp}\n=======================================================\n`);
      } else if (demoLogins?.customer?.code && cleanPhone === demoLogins.customer.phone.replace(/\D/g, "")) {
        setOtpCode(demoLogins.customer.code);
      }
      setResendCooldown(30);
    } catch (err) {
      setOtpError(errorMessage(err));
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
      const result = await apiFetch<{
        accessToken: string;
        user: { id: string; name: string | null; phone: string; role: string };
      }>("/auth/verify-otp", {
        method: "POST",
        body: { phone: `+91${cleanPhone}`, otp: otpCode.trim() },
      });

      await signIn(result.accessToken, result.user as any);
      if (result.user.name && !name) {
        setName(result.user.name);
      }
      const refetched = await addressesQuery.refetch();
      const addrs = refetched.data ?? [];
      if (addrs.length > 0) {
        const def = addrs.find((a) => a.isDefault) ?? addrs[0];
        if (def) setSelectedAddressId(def.id);
        setIsNewAddress(false);
      } else {
        setIsNewAddress(true);
      }
      setStep(2);
    } catch (err) {
      setOtpError(errorMessage(err));
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleResendOtp() {
    setOtpSending(true);
    setOtpError(null);
    try {
      const cleanPhone = phone.replace(/\D/g, "");
      const res = await apiFetch<{ message: string; devOtp?: string }>("/auth/send-otp", {
        method: "POST",
        body: { phone: `+91${cleanPhone}` },
      });
      if (res.devOtp) {
        setDevOtp(res.devOtp);
        setOtpCode(res.devOtp);
        console.log(`\n=======================================================\n🔑 [DEV OTP] Resent code for +91${cleanPhone}: ${res.devOtp}\n=======================================================\n`);
      } else if (demoLogins?.customer?.code && cleanPhone === demoLogins.customer.phone.replace(/\D/g, "")) {
        setOtpCode(demoLogins.customer.code);
      }
      setResendCooldown(30);
    } catch (err) {
      setOtpError(errorMessage(err));
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

  async function submit() {
    setError(null);

    const cleanPhone = phone.replace(/\D/g, "");
    const newErrors: Record<string, string> = {};

    const nameErr = validateField("name", name);
    if (nameErr) newErrors.name = nameErr;

    // Validate manual address only if creating a new address
    if (isNewAddress || !selectedAddressId) {
      const addrErr = validateField("addressLine1", addressLine1);
      if (addrErr) newErrors.addressLine1 = addrErr;

      const landmarkErr = validateField("landmark", landmark);
      if (landmarkErr) newErrors.landmark = landmarkErr;

      const pinErr = validateField("postalCode", postalCode);
      if (pinErr) newErrors.postalCode = pinErr;

      const stateErr = validateField("state", state);
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
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        items: items.map((it) => ({ variantId: it.variantId, quantity: it.quantity })),
        paymentMethod,
      };

      if (!user) {
        body.customer = {
          name: name.trim(),
          phone: `+91${cleanPhone}`,
          email: email.trim() || undefined,
        };
      } else {
        const cust: Record<string, string> = {};
        if (name.trim()) cust.name = name.trim();
        if (cleanPhone) cust.phone = `+91${cleanPhone}`;
        if (email.trim()) cust.email = email.trim();
        if (Object.keys(cust).length > 0) body.customer = cust;
      }

      if (!isNewAddress && selectedAddressId) {
        body.addressId = selectedAddressId;
      } else {
        body.address = {
          addressLine1: addressLine1.trim(),
          landmark: landmark.trim() || undefined,
          city: city.trim(),
          state: state.trim(),
          postalCode: postalCode.trim(),
        };
      }

      const response = await apiFetch<{
        order: OrderDetail;
        accessToken: string;
        user: { id: string; name: string | null; phone: string; role: string };
        payment: { checkoutUrl: string } | null;
      }>("/orders/direct", {
        method: "POST",
        body,
      });

      // Sign in the user locally if returned
      if (response.accessToken && response.user) {
        await signIn(response.accessToken, response.user as any);
      }
      await clearGuestCart();
      queryClient.invalidateQueries({ queryKey: CART_KEY });

      onClose();
      router.dismissAll();
      router.push({ pathname: "/order/[id]", params: { id: response.order.id, placed: "1" } });
      if (response.order.status === "PENDING_PAYMENT") {
        router.push({ pathname: "/pay/[id]", params: { id: response.order.id } });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior="padding"
        className="flex-1 justify-end"
      >
        {/* Backdrop */}
        <Pressable onPress={onClose} className="absolute inset-0 bg-black/60" accessibilityLabel="Close" />

        {/* Bottom Sheet */}
        <View
          className="rounded-t-3xl bg-card shadow-2xl"
          style={{
            maxHeight: keyboardVisible ? "80%" : "92%",
            paddingBottom: keyboardVisible ? 12 : insets.bottom + 12,
          }}
        >
          {/* Header */}
          <View className="flex-row items-center border-b border-border px-4 py-3.5">
            {step === 2 && !user ? (
              <Pressable
                onPress={() => setStep(1)}
                className="size-8 items-center justify-center rounded-full bg-muted active:opacity-70"
                hitSlop={8}
                accessibilityLabel="Go back to mobile verification"
              >
                <Icon as={ArrowLeft} size={18} />
              </Pressable>
            ) : (
              <View className="size-8" />
            )}
            <View className="flex-1 items-center">
              <Text className="text-center font-bold text-base">
                {step === 1 ? "Step 1 of 2: Mobile Number" : "Step 2 of 2: Delivery & Payment"}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              className="size-8 items-center justify-center rounded-full bg-muted active:opacity-70"
              hitSlop={8}
              accessibilityLabel="Close"
            >
              <Icon as={X} size={18} />
            </Pressable>
          </View>

          <ScrollView
            className="shrink"
            contentContainerClassName="gap-3.5 px-4 pt-3 pb-6"
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {/* Step Progress Bar */}
            <View className="flex-row items-center gap-2">
              <View className={cn("flex-1 h-1 rounded-full", step >= 1 ? "bg-primary" : "bg-muted")} />
              <View className={cn("flex-1 h-1 rounded-full", step >= 2 ? "bg-primary" : "bg-muted")} />
            </View>

            {/* Product summary card */}
            <View className="flex-row items-center gap-3 rounded-xl bg-muted/40 p-2.5">
              <View className="relative size-12 items-center justify-center overflow-hidden rounded-lg bg-card border border-border">
                <View className="absolute left-0.5 top-0.5 z-10 size-4 items-center justify-center rounded-full bg-foreground">
                  <Text className="text-[9px] font-bold text-background">{primaryItem.quantity}</Text>
                </View>
                {primaryItem.imageUrl ? (
                  <Image source={{ uri: smallImage(primaryItem.imageUrl) }} style={{ width: "85%", height: "85%" }} contentFit="contain" />
                ) : (
                  <Text className="text-base font-extrabold text-primary">{primaryItem.name.charAt(0)}</Text>
                )}
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold" numberOfLines={1}>
                  {primaryItem.name}
                </Text>
                <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
                  {items.length === 1 ? primaryItem.variantLabel || primaryItem.name : `${items.length} items`}
                </Text>
              </View>
              <Text className="text-sm font-extrabold">{formatMoney(totalAmount, currency)}</Text>
            </View>

            {/* Error banner */}
            {error ? (
              <View className="rounded-lg bg-destructive/10 p-3">
                <Text className="text-xs font-semibold text-destructive">{error}</Text>
              </View>
            ) : null}

            {/* ================= STEP 1: PHONE NUMBER & OTP ================= */}
            {step === 1 && (
              <View className="gap-3.5 pt-1">
                <View className="gap-1">
                  <Text className="text-sm font-bold text-foreground">Verify your mobile number</Text>
                  <Text className="text-xs text-muted-foreground">
                    We&apos;ll send a one-time password (OTP) to your phone number before taking delivery details.
                  </Text>
                </View>

                {/* Mobile number input */}
                <View className="gap-1">
                  <Text className="text-xs font-semibold">
                    10-Digit Mobile Number<Text className="text-destructive">*</Text>
                  </Text>
                  <View
                    className={cn(
                      "h-12 flex-row items-center overflow-hidden rounded-xl border bg-card",
                      hasError("phone") ? "border-2 border-destructive" : "border-input",
                    )}
                  >
                    <View className="h-full px-3.5 items-center justify-center border-r border-input bg-muted/40">
                      <Text className="text-sm font-bold text-foreground">+91</Text>
                    </View>
                    <TextInput
                      value={phone}
                      onChangeText={(val) => {
                        const cleaned = val.replace(/\D/g, "");
                        setPhone(cleaned);
                        setOtpSent(false);
                        setOtpCode("");
                        setOtpError(null);
                        handleFieldChange("phone", cleaned);
                      }}
                      onBlur={() => handleFieldBlur("phone", phone)}
                      placeholder="98765 43210"
                      placeholderTextColor={neutral.mutedForeground}
                      keyboardType="phone-pad"
                      maxLength={10}
                      autoFocus
                      className="flex-1 px-3.5 text-base font-semibold tracking-wider text-foreground"
                    />
                  </View>
                  {hasError("phone") ? (
                    <Text className="text-[11px] font-medium text-destructive">{errors.phone}</Text>
                  ) : null}
                </View>

                {/* Send OTP button (shown when OTP not yet sent) */}
                {!otpSent ? (
                  <Button
                    onPress={handleSendOtp}
                    disabled={otpSending || phone.replace(/\D/g, "").length !== 10}
                    className="mt-2 h-12 w-full rounded-xl"
                  >
                    {otpSending ? (
                      <ActivityIndicator color={colors.onPrimary} />
                    ) : (
                      <Text className="text-sm font-bold text-primary-foreground">Get OTP to Continue</Text>
                    )}
                  </Button>
                ) : (
                  /* OTP Entry Card */
                  <View className="rounded-xl border border-primary/20 bg-primary/5 p-4 gap-3">
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <Icon as={KeyRound} size={16} className="text-primary" />
                        <Text className="text-xs font-bold text-primary">Enter Verification Code</Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          setOtpSent(false);
                          setOtpCode("");
                          setOtpError(null);
                        }}
                        hitSlop={6}
                      >
                        <Text className="text-xs font-semibold text-muted-foreground underline">Change number</Text>
                      </Pressable>
                    </View>

                    <Text className="text-xs text-muted-foreground">
                      Enter the 6-digit OTP sent to <Text className="font-bold text-foreground">+91 {phone}</Text>
                    </Text>

                    <View className="flex-row items-center gap-2">
                      <TextInput
                        value={otpCode}
                        onChangeText={(val) => {
                          const cleaned = val.replace(/\D/g, "");
                          setOtpCode(cleaned);
                          setOtpError(null);
                        }}
                        placeholder="6-digit OTP"
                        placeholderTextColor={neutral.mutedForeground}
                        keyboardType="number-pad"
                        maxLength={6}
                        autoFocus
                        className="h-11 flex-1 rounded-lg border border-border bg-card px-3 text-center text-lg font-bold tracking-widest text-foreground"
                      />
                      <Button
                        disabled={otpLoading || otpCode.length < 6}
                        onPress={handleVerifyOtp}
                        className="h-11 rounded-lg px-5"
                      >
                        {otpLoading ? (
                          <ActivityIndicator size="small" color={colors.onPrimary} />
                        ) : (
                          <Text className="text-xs font-bold">Verify & Proceed</Text>
                        )}
                      </Button>
                    </View>

                    {otpError ? (
                      <Text className="text-xs font-medium text-destructive">{otpError}</Text>
                    ) : null}

                    <View className="flex-row items-center justify-between pt-1">
                      <Text className="text-xs text-muted-foreground">Didn&apos;t receive code?</Text>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={otpSending || resendCooldown > 0}
                        onPress={handleResendOtp}
                        className="h-8 px-2"
                      >
                        {otpSending ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <Text className="text-xs font-semibold text-primary">
                            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
                          </Text>
                        )}
                      </Button>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ================= STEP 2: DELIVERY DETAILS & PAYMENT ================= */}
            {step === 2 && (
              <View className="gap-3.5 pt-1">
                {/* Verified Phone Chip */}
                <View className="flex-row items-center justify-between rounded-xl bg-primary/10 px-3.5 py-2.5">
                  <View className="flex-row items-center gap-2">
                    <Icon as={CheckCircle2} size={16} className="text-primary" />
                    <Text className="text-xs font-bold text-primary">Verified Phone: +91 {phone}</Text>
                  </View>
                  {!user && (
                    <Pressable
                      onPress={() => {
                        setStep(1);
                        setOtpSent(false);
                      }}
                      hitSlop={6}
                    >
                      <Text className="text-xs font-semibold text-muted-foreground underline">Change</Text>
                    </Pressable>
                  )}
                </View>

                {/* Saved Addresses for Returning / Verified Customer */}
                {savedAddresses.length > 0 && (
                  <View className="gap-2 rounded-xl bg-muted/40 p-3">
                    <Text className="text-xs font-bold uppercase text-muted-foreground">Delivering To</Text>
                    <View className="gap-2">
                      {savedAddresses.map((addr) => {
                        const isSelected = !isNewAddress && selectedAddressId === addr.id;
                        return (
                          <Pressable
                            key={addr.id}
                            onPress={() => {
                              setSelectedAddressId(addr.id);
                              setIsNewAddress(false);
                            }}
                            className={cn(
                              "flex-row items-start gap-2.5 rounded-lg border p-3 bg-card active:opacity-80",
                              isSelected ? "border-primary bg-primary/5" : "border-border",
                            )}
                          >
                            <View
                              className={cn(
                                "mt-0.5 size-4 rounded-full border items-center justify-center",
                                isSelected ? "border-primary bg-primary" : "border-muted-foreground",
                              )}
                            >
                              {isSelected && <View className="size-1.5 rounded-full bg-background" />}
                            </View>
                            <View className="flex-1">
                              <Text className="text-xs font-bold text-foreground">
                                {addr.label || addr.name} · {addr.phone}
                              </Text>
                              <Text className="text-xs text-muted-foreground mt-0.5">
                                {addr.addressLine1}, {addr.city}, {addr.state} {addr.postalCode}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                      <Pressable
                        onPress={() => setIsNewAddress(true)}
                        className="pt-1 active:opacity-70"
                      >
                        <Text className={cn("text-xs font-bold", isNewAddress ? "text-primary" : "text-muted-foreground")}>
                          + Deliver to a different address
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Full Name & Address Fields (shown if entering a new address or no saved addresses) */}
                {(isNewAddress || savedAddresses.length === 0) && (
                  <>
                    {/* Full Name */}
                    <View className="gap-1">
                      <Text className="text-xs font-semibold">
                        Full Name<Text className="text-destructive">*</Text>
                      </Text>
                      <View
                        className={cn(
                          "h-11 flex-row items-center overflow-hidden rounded-lg border bg-card",
                          hasError("name") ? "border-2 border-destructive" : "border-input",
                        )}
                      >
                        <View
                          className={cn(
                            "h-full w-11 items-center justify-center border-r",
                            hasError("name") ? "border-r-destructive bg-destructive/10" : "border-input bg-muted/40",
                          )}
                        >
                          <Icon as={User} size={18} className={hasError("name") ? "text-destructive" : "text-muted-foreground"} />
                        </View>
                        <TextInput
                          value={name}
                          onChangeText={(val) => {
                            setName(val);
                            handleFieldChange("name", val);
                          }}
                          onBlur={() => handleFieldBlur("name", name)}
                          placeholder="Full Name (English)"
                          placeholderTextColor={neutral.mutedForeground}
                          autoCapitalize="words"
                          className="flex-1 px-3 text-sm text-foreground"
                        />
                      </View>
                      {hasError("name") ? (
                        <Text className="text-[11px] font-medium text-destructive">{errors.name}</Text>
                      ) : null}
                    </View>

                    {/* Address Line 1 */}
                    <View className="gap-1">
                      <Text className="text-xs font-semibold">
                        House / Flat No., Building, Street<Text className="text-destructive">*</Text>
                      </Text>
                      <View
                        className={cn(
                          "h-11 flex-row items-center overflow-hidden rounded-lg border bg-card",
                          hasError("addressLine1") ? "border-2 border-destructive" : "border-input",
                        )}
                      >
                        <View
                          className={cn(
                            "h-full w-11 items-center justify-center border-r",
                            hasError("addressLine1") ? "border-r-destructive bg-destructive/10" : "border-input bg-muted/40",
                          )}
                        >
                          <Icon as={MapPin} size={18} className={hasError("addressLine1") ? "text-destructive" : "text-muted-foreground"} />
                        </View>
                        <TextInput
                          value={addressLine1}
                          onChangeText={(val) => {
                            setAddressLine1(val);
                            handleFieldChange("addressLine1", val);
                          }}
                          onBlur={() => handleFieldBlur("addressLine1", addressLine1)}
                          placeholder="e.g. Flat 402, Sunshine Apts, MG Road"
                          placeholderTextColor={neutral.mutedForeground}
                          className="flex-1 px-3 text-sm text-foreground"
                        />
                      </View>
                      {hasError("addressLine1") ? (
                        <Text className="text-[11px] font-medium text-destructive">{errors.addressLine1}</Text>
                      ) : null}
                    </View>

                    {/* Landmark */}
                    <View className="gap-1">
                      <Text className="text-xs font-semibold">
                        Nearby Landmark<Text className="text-destructive">*</Text>
                      </Text>
                      <View
                        className={cn(
                          "h-11 flex-row items-center overflow-hidden rounded-lg border bg-card",
                          hasError("landmark") ? "border-2 border-destructive" : "border-input",
                        )}
                      >
                        <View
                          className={cn(
                            "h-full w-11 items-center justify-center border-r",
                            hasError("landmark") ? "border-r-destructive bg-destructive/10" : "border-input bg-muted/40",
                          )}
                        >
                          <Icon as={MapPin} size={18} className={hasError("landmark") ? "text-destructive" : "text-muted-foreground"} />
                        </View>
                        <TextInput
                          value={landmark}
                          onChangeText={(val) => {
                            setLandmark(val);
                            handleFieldChange("landmark", val);
                          }}
                          onBlur={() => handleFieldBlur("landmark", landmark)}
                          placeholder="e.g. Near City Hospital"
                          placeholderTextColor={neutral.mutedForeground}
                          className="flex-1 px-3 text-sm text-foreground"
                        />
                      </View>
                      {hasError("landmark") ? (
                        <Text className="text-[11px] font-medium text-destructive">{errors.landmark}</Text>
                      ) : null}
                    </View>

                    {/* PIN Code */}
                    <View className="gap-1">
                      <Text className="text-xs font-semibold">
                        6-digit PIN code<Text className="text-destructive">*</Text>
                      </Text>
                      <View
                        className={cn(
                          "h-11 flex-row items-center overflow-hidden rounded-lg border bg-card",
                          hasError("postalCode") ? "border-2 border-destructive" : "border-input",
                        )}
                      >
                        <View
                          className={cn(
                            "h-full w-11 items-center justify-center border-r",
                            hasError("postalCode") ? "border-r-destructive bg-destructive/10" : "border-input bg-muted/40",
                          )}
                        >
                          <Icon as={Hash} size={18} className={hasError("postalCode") ? "text-destructive" : "text-muted-foreground"} />
                        </View>
                        <TextInput
                          value={postalCode}
                          onChangeText={(val) => {
                            const cleaned = val.replace(/\D/g, "");
                            setPostalCode(cleaned);
                            handleFieldChange("postalCode", cleaned);
                          }}
                          onBlur={() => handleFieldBlur("postalCode", postalCode)}
                          placeholder="6-digit PIN code"
                          placeholderTextColor={neutral.mutedForeground}
                          keyboardType="numeric"
                          maxLength={6}
                          className="flex-1 px-3 text-sm text-foreground"
                        />
                      </View>
                      {hasError("postalCode") ? (
                        <Text className="text-[11px] font-medium text-destructive">{errors.postalCode}</Text>
                      ) : null}
                    </View>

                    {/* State picker */}
                    <StatePicker
                      value={state}
                      onChange={(val) => {
                        setState(val);
                        handleFieldChange("state", val);
                      }}
                      error={hasError("state") ? errors.state : undefined}
                    />

                    {/* City */}
                    <View className="gap-1">
                      <Text className="text-xs font-semibold">
                        City<Text className="text-destructive">*</Text>
                      </Text>
                      <View
                        className={cn(
                          "h-11 flex-row items-center overflow-hidden rounded-lg border bg-card",
                          hasError("city") ? "border-2 border-destructive" : "border-input",
                        )}
                      >
                        <View
                          className={cn(
                            "h-full w-11 items-center justify-center border-r",
                            hasError("city") ? "border-r-destructive bg-destructive/10" : "border-input bg-muted/40",
                          )}
                        >
                          <Icon as={MapPin} size={18} className={hasError("city") ? "text-destructive" : "text-muted-foreground"} />
                        </View>
                        <TextInput
                          value={city}
                          onChangeText={(val) => {
                            setCity(val);
                            handleFieldChange("city", val);
                          }}
                          onBlur={() => handleFieldBlur("city", city)}
                          placeholder="City name"
                          placeholderTextColor={neutral.mutedForeground}
                          className="flex-1 px-3 text-sm text-foreground"
                        />
                      </View>
                      {hasError("city") ? (
                        <Text className="text-[11px] font-medium text-destructive">{errors.city}</Text>
                      ) : null}
                    </View>
                  </>
                )}

                {/* Optional Email toggle */}
                {!showEmail ? (
                  <Pressable onPress={() => setShowEmail(true)} className="self-start py-1">
                    <Text className="text-xs font-semibold text-primary">+ Add email address (for order updates)</Text>
                  </Pressable>
                ) : (
                  <View className="gap-1">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-xs font-semibold">Email (optional)</Text>
                      <Pressable onPress={() => setShowEmail(false)}>
                        <Text className="text-xs text-muted-foreground">Remove</Text>
                      </Pressable>
                    </View>
                    <TextInput
                      value={email}
                      onChangeText={(val) => {
                        setEmail(val);
                        handleFieldChange("email", val);
                      }}
                      onBlur={() => handleFieldBlur("email", email)}
                      placeholder="name@example.com"
                      placeholderTextColor={neutral.mutedForeground}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      className="h-11 rounded-lg border border-input bg-card px-3 text-sm text-foreground"
                    />
                    {hasError("email") ? (
                      <Text className="text-[11px] font-medium text-destructive">{errors.email}</Text>
                    ) : null}
                  </View>
                )}

                {/* Payment method selector */}
                <View className="gap-1.5 pt-2">
                  <Text className="text-xs font-semibold uppercase text-muted-foreground">Select Payment Option</Text>
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => setPaymentMethod("COD")}
                      className={cn(
                        "flex-1 flex-row items-center justify-center gap-2 rounded-xl border p-3 active:opacity-80",
                        paymentMethod === "COD" ? "border-primary bg-primary/10" : "border-border bg-card",
                      )}
                    >
                      <Icon as={Banknote} size={18} className={paymentMethod === "COD" ? "text-primary" : "text-muted-foreground"} />
                      <Text className={cn("text-xs font-bold", paymentMethod === "COD" ? "text-primary" : "text-foreground")}>
                        Cash on Delivery
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setPaymentMethod("ONLINE")}
                      className={cn(
                        "flex-1 flex-row items-center justify-center gap-2 rounded-xl border p-3 active:opacity-80",
                        paymentMethod === "ONLINE" ? "border-primary bg-primary/10" : "border-border bg-card",
                      )}
                    >
                      <Icon as={CreditCard} size={18} className={paymentMethod === "ONLINE" ? "text-primary" : "text-muted-foreground"} />
                      <Text className={cn("text-xs font-bold", paymentMethod === "ONLINE" ? "text-primary" : "text-foreground")}>
                        Pay Online
                      </Text>
                    </Pressable>
                  </View>
                </View>

                {/* Trust badge */}
                <View className="items-center justify-center rounded-lg bg-muted/40 py-2">
                  <Text className="text-[11px] font-medium text-muted-foreground">
                    🔒 100% Secure Checkout · Safe & Verified
                  </Text>
                </View>

                {/* Submit button */}
                <Button
                  onPress={submit}
                  disabled={loading}
                  className="mt-2 h-14 w-full rounded-xl"
                >
                  {loading ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Text className="text-base font-extrabold text-primary-foreground">
                      {paymentMethod === "COD"
                        ? `Place Order · ${formatMoney(totalAmount, currency)}`
                        : `Pay & Order · ${formatMoney(totalAmount, currency)}`}
                    </Text>
                  )}
                </Button>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
