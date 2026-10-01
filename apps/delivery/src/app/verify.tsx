import { useMutation } from "@tanstack/react-query";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusStatusBar } from "@/components/focus-status-bar";
import { OtpInput } from "@/components/otp-input";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";
import { useAppTheme } from "@/lib/app-theme";
import { formatPhone } from "@/lib/phone";
import { useSession } from "@/lib/session";
import type { User } from "@/lib/types";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

export default function VerifyScreen() {
  const { phone, alreadySent } = useLocalSearchParams<{ phone?: string; alreadySent?: string }>();
  const { signIn } = useSession();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(alreadySent ? "We sent you a code a moment ago. It is valid for 5 minutes." : null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  const verify = useMutation({
    mutationFn: (otp: string) => apiFetch<{ accessToken: string; user: User }>("/auth/verify-otp", { method: "POST", body: { phone, otp } }),
  });
  const resend = useMutation({ mutationFn: () => apiFetch("/auth/send-otp", { method: "POST", body: { phone } }) });

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  if (!phone) return <Redirect href="/sign-in" />;

  async function submit(otp: string) {
    setError(null);
    setNotice(null);
    try {
      const { accessToken, user } = await verify.mutateAsync(otp);
      if (user.role !== "DELIVERY_PARTNER") {
        setCode("");
        setError("This number isn't registered as a delivery partner. Ask your store admin to add you.");
        return;
      }
      // The protected routes in the root layout move to the home screen once the session exists.
      await signIn(accessToken, user);
    } catch (caught) {
      setCode("");
      setError(caught instanceof ApiError && caught.code === "INVALID_OTP" ? "That code is incorrect or has expired. Try again." : errorMessage(caught));
    }
  }

  async function onResend() {
    setError(null);
    setCode("");
    try {
      await resend.mutateAsync();
      setNotice("A new code is on its way.");
      setSecondsLeft(RESEND_SECONDS);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function onChange(value: string) {
    setCode(value);
    setError(null);
    if (value.length === OTP_LENGTH) submit(value);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <View className="h-14 flex-row items-center gap-2 px-2">
        <Pressable onPress={() => router.back()} className="size-11 items-center justify-center rounded-full active:bg-accent" accessibilityLabel="Back" hitSlop={8}>
          <Icon as={ArrowLeft} size={22} />
        </Pressable>
        <Text className="text-lg font-bold">OTP verification</Text>
      </View>

      <View className="gap-6 px-6 pt-6">
        <View className="gap-1">
          <Text className="text-base text-muted-foreground">We have sent a verification code to</Text>
          <Text className="text-lg font-bold">{formatPhone(phone)}</Text>
        </View>

        <OtpInput value={code} onChange={onChange} length={OTP_LENGTH} invalid={Boolean(error)} editable={!verify.isPending} />

        <View className="min-h-6">
          {verify.isPending ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator color={colors.primary} />
              <Text className="text-sm text-muted-foreground">Verifying…</Text>
            </View>
          ) : error ? (
            <Text className="text-sm text-destructive">{error}</Text>
          ) : notice ? (
            <Text className="text-sm text-muted-foreground">{notice}</Text>
          ) : null}
        </View>

        <View className="flex-row items-center gap-1">
          <Text className="text-sm text-muted-foreground">Didn&apos;t get the code?</Text>
          {secondsLeft > 0 ? (
            <Text className="text-sm font-semibold text-muted-foreground">Resend in {secondsLeft}s</Text>
          ) : (
            <Pressable onPress={onResend} disabled={resend.isPending} hitSlop={8}>
              <Text className="text-sm font-bold text-primary">{resend.isPending ? "Sending…" : "Resend OTP"}</Text>
            </Pressable>
          )}
        </View>

        {__DEV__ && <Text className="text-xs text-muted-foreground">Development: the code is printed in the API log.</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}
