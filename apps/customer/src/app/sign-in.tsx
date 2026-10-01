import { useMutation } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Apple, Carrot, Coffee, Cookie, Egg, Milk, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark } from "@/components/brand-mark";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { PHONE_COUNTRY_CODE, PHONE_NATIONAL_LENGTH } from "@/lib/config";
import { isValidNationalNumber, toE164 } from "@/lib/phone";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const COLLAGE: { icon: LucideIcon; tilt: string }[][] = [
  [
    { icon: Apple, tilt: "-rotate-6" },
    { icon: Milk, tilt: "rotate-3" },
    { icon: Carrot, tilt: "-rotate-3" },
  ],
  [
    { icon: Cookie, tilt: "rotate-6" },
    { icon: Coffee, tilt: "-rotate-2" },
    { icon: Egg, tilt: "rotate-3" },
  ],
];

function Collage() {
  const surface = useCardSurface();
  return (
    <View className="gap-4">
      {COLLAGE.map((row, rowIndex) => (
        <View key={rowIndex} className={cn("flex-row justify-center gap-4", rowIndex === 1 && "translate-x-6")}>
          {row.map(({ icon, tilt }, index) => (
            <View key={index} className={cn("size-[84px] items-center justify-center rounded-xl", surface, tilt)}>
              <Icon as={icon} size={38} className="text-primary" strokeWidth={1.6} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function SignInScreen() {
  const { announcement } = useSettings();
  const { colors, neutral } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sendOtp = useMutation({ mutationFn: (phone: string) => apiFetch("/auth/send-otp", { method: "POST", body: { phone } }) });
  const valid = isValidNationalNumber(digits);

  async function submit() {
    if (!valid || sendOtp.isPending) return;
    setError(null);
    const phone = toE164(digits);
    try {
      await sendOtp.mutateAsync(phone);
      router.push({ pathname: "/verify", params: { phone } });
    } catch (caught) {
      // A code was sent less than a minute ago (e.g. after going back); it is still valid.
      if (caught instanceof ApiError && caught.code === "OTP_COOLDOWN") {
        router.push({ pathname: "/verify", params: { phone, alreadySent: "1" } });
        return;
      }
      setError(errorMessage(caught));
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-background">
      <FocusStatusBar onHighlight />
      <ScrollView contentContainerClassName="flex-grow" keyboardShouldPersistTaps="handled" bounces={false}>
        <LinearGradient
          colors={[colors.accent, colors.accent, neutral.background]}
          locations={[0, 0.72, 1]}
          style={{ paddingTop: insets.top + 28, paddingBottom: 36, overflow: "hidden" }}
        >
          <Collage />
        </LinearGradient>

        <View className="flex-1 gap-5 px-6" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="items-center gap-2">
            <BrandMark size="lg" vertical />
            {announcement.enabled && announcement.text ? <Text className="text-center text-lg font-bold leading-snug">{announcement.text}</Text> : null}
          </View>

          <View className="flex-row items-center gap-3">
            <Separator className="flex-1" />
            <Text className="text-sm font-medium text-muted-foreground">Log in or sign up</Text>
            <Separator className="flex-1" />
          </View>

          <View className={cn("h-14 flex-row items-center rounded-lg border bg-card px-4", error ? "border-destructive" : "border-input")}>
            <Text className="text-base font-semibold">{PHONE_COUNTRY_CODE}</Text>
            <View className="mx-3 h-6 w-px bg-border" />
            <TextInput
              value={digits}
              onChangeText={(text) => {
                setDigits(text.replace(/\D/g, ""));
                setError(null);
              }}
              onSubmitEditing={submit}
              placeholder="Enter mobile number"
              keyboardType="number-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              returnKeyType="done"
              maxLength={PHONE_NATIONAL_LENGTH}
              accessibilityLabel="Mobile number"
              className="h-full flex-1 text-base font-medium text-foreground placeholder:text-muted-foreground"
            />
          </View>
          {error && <Text className="-mt-2 text-sm text-destructive">{error}</Text>}

          <Button onPress={submit} disabled={!valid || sendOtp.isPending} className="h-14 rounded-lg">
            {sendOtp.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text className="text-base font-bold">Continue</Text>}
          </Button>

          <Text className="mt-auto text-center text-xs leading-5 text-muted-foreground">By continuing, you agree to our Terms of Service and Privacy Policy.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
