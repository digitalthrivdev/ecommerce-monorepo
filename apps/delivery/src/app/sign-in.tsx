import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { Bike } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark } from "@/components/brand-mark";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { ApiError, apiFetch, errorMessage } from "@/lib/api";
import { useAppTheme } from "@/lib/app-theme";
import { PHONE_COUNTRY_CODE, PHONE_NATIONAL_LENGTH } from "@/lib/config";
import { isValidNationalNumber, toE164 } from "@/lib/phone";
import { cn } from "@/lib/utils";

export default function SignInScreen() {
  const { colors } = useAppTheme();
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
        <View className="items-center gap-4 rounded-b-[32px] bg-highlight px-6 pb-10" style={{ paddingTop: insets.top + 40 }}>
          <View className="size-24 items-center justify-center rounded-full bg-card">
            <Icon as={Bike} size={48} className="text-primary" strokeWidth={1.6} />
          </View>
          <BrandMark textClassName="text-highlight-foreground text-2xl" />
          <Text className="text-base font-semibold text-highlight-foreground">Delivery partner</Text>
        </View>

        <View className="flex-1 gap-5 px-6 pt-8" style={{ paddingBottom: insets.bottom + 16 }}>
          <View className="gap-1">
            <Text className="text-xl font-extrabold">Log in</Text>
            <Text className="text-sm text-muted-foreground">Use the phone number your store registered for you.</Text>
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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
