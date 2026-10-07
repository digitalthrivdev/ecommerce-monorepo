import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusStatusBar } from "@/components/focus-status-bar";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { useAppTheme } from "@/lib/app-theme";
import { useCash, useDeleteAccount, usePayouts } from "@/lib/delivery";
import { formatMoney } from "@/lib/format";
import { useSettings } from "@/lib/settings";

const CONFIRM_WORD = "DELETE";

function Bullet({ children }: { children: string }) {
  return (
    <View className="flex-row gap-2">
      <Text className="text-[15px] text-muted-foreground">•</Text>
      <Text className="flex-1 text-[15px] text-muted-foreground">{children}</Text>
    </View>
  );
}

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { appName } = useSettings();
  const cash = useCash().data;
  const earnings = usePayouts().data?.pages[0]?.earnings;
  const deleteAccount = useDeleteAccount();
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;
  const holdsCash = cash && Number(cash.inHand) > 0;
  const owed = earnings && Number(earnings.unpaid) > 0;

  async function submit() {
    try {
      await deleteAccount.mutateAsync();
      Alert.alert("Account deleted", `Your ${appName} Delivery account has been deleted.`);
    } catch (error) {
      Alert.alert("Couldn't delete your account", errorMessage(error));
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title="Delete account" />
      <ScrollView contentContainerClassName="gap-5 px-4 pb-6 pt-2" keyboardShouldPersistTaps="handled">
        <Text className="text-[15px]">Deleting your account is permanent and cannot be undone. You are logged out and stop receiving deliveries.</Text>
        {holdsCash ? (
          <Text className="text-sm font-semibold text-destructive">
            You hold {formatMoney(cash.inHand, cash.currency)} in cash. Deposit it at the store before deleting your account.
          </Text>
        ) : null}
        {owed ? (
          <Text className="text-sm font-semibold text-destructive">
            You have {formatMoney(earnings.unpaid, earnings.currency)} in earnings still to be paid. Ask support for it first, because we cannot
            reach you after your account is deleted.
          </Text>
        ) : null}
        <View className="gap-2">
          <Text className="text-sm font-semibold">What is deleted</Text>
          <Bullet>Your name and phone number</Bullet>
          <Bullet>Your vehicle details</Bullet>
        </View>
        <View className="gap-2">
          <Text className="text-sm font-semibold">What we keep</Text>
          <Bullet>Records of your deliveries, cash deposits and payouts, for as long as tax and accounting laws require</Bullet>
        </View>
        <View className="gap-1.5">
          <Text className="text-sm font-semibold">Type {CONFIRM_WORD} to confirm</Text>
          <Input
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
            className="h-12 rounded-lg bg-card text-[15px]"
          />
        </View>
      </ScrollView>

      <View className="gap-2 border-t border-border bg-card px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <Button variant="destructive" onPress={submit} disabled={!confirmed || deleteAccount.isPending} className="h-12 rounded-lg">
          {deleteAccount.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text className="text-base font-bold">Delete my account</Text>}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
