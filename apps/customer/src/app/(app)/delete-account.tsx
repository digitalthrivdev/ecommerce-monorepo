import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusStatusBar } from "@/components/focus-status-bar";
import { FormField } from "@/components/form-field";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { useAppTheme } from "@/lib/app-theme";
import { useDeleteAccount } from "@/lib/profile";
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
  const deleteAccount = useDeleteAccount();
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

  async function submit() {
    try {
      await deleteAccount.mutateAsync();
      Alert.alert("Account deleted", `Your ${appName} account has been deleted.`);
    } catch (error) {
      Alert.alert("Couldn't delete your account", errorMessage(error));
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title="Delete account" />
      <ScrollView contentContainerClassName="gap-5 px-4 pb-6 pt-2" keyboardShouldPersistTaps="handled">
        <Text className="text-[15px]">Deleting your account is permanent and cannot be undone. You are logged out on every device.</Text>
        <View className="gap-2">
          <Text className="text-sm font-semibold">What is deleted</Text>
          <Bullet>Your name, email address and phone number</Bullet>
          <Bullet>Your saved addresses and your cart</Bullet>
        </View>
        <View className="gap-2">
          <Text className="text-sm font-semibold">What we keep</Text>
          <Bullet>Records of your past orders, for as long as tax and accounting laws require</Bullet>
        </View>
        <Text className="text-sm text-muted-foreground">
          If an order is still in progress, wait until it is delivered or cancelled. You can sign up again later with the same number, as a new
          account.
        </Text>
        <FormField
          label={`Type ${CONFIRM_WORD} to confirm`}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
        />
      </ScrollView>

      <View className="gap-2 border-t border-border bg-card px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <Button variant="destructive" onPress={submit} disabled={!confirmed || deleteAccount.isPending} className="h-12 rounded-lg">
          {deleteAccount.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text className="text-base font-bold">Delete my account</Text>}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
