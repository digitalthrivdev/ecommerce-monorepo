import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusStatusBar } from "@/components/focus-status-bar";
import { FormField } from "@/components/form-field";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { ApiError, errorMessage } from "@/lib/api";
import { useAppTheme } from "@/lib/app-theme";
import { formatPhone } from "@/lib/phone";
import { useUpdateProfile } from "@/lib/profile";
import { useSession } from "@/lib/session";

type Fields = { name: string; email: string };
type FieldErrors = Partial<Record<keyof Fields, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(fields: Fields): FieldErrors {
  const errors: FieldErrors = {};
  if (!fields.name.trim()) errors.name = "Enter your name";
  if (fields.email.trim() && !EMAIL_PATTERN.test(fields.email.trim())) errors.email = "Enter a valid email address";
  return errors;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { user } = useSession();
  const save = useUpdateProfile();
  const [fields, setFields] = useState<Fields>(() => ({ name: user?.name ?? "", email: user?.email ?? "" }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (key: keyof Fields) => (value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  async function submit() {
    setFormError(null);
    const found = validate(fields);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    try {
      await save.mutateAsync({ name: fields.name.trim(), email: fields.email.trim() || null });
      router.back();
    } catch (caught) {
      const issues = caught instanceof ApiError ? (caught.issues ?? []) : [];
      const byField = Object.fromEntries(issues.filter((issue) => issue.path in fields).map((issue) => [issue.path, issue.message]));
      setErrors(byField);
      setFormError(Object.keys(byField).length ? "Check the highlighted fields." : errorMessage(caught));
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title="Your profile" />
      <ScrollView contentContainerClassName="gap-5 px-4 pb-6 pt-2" keyboardShouldPersistTaps="handled">
        <FormField label="Name" value={fields.name} onChangeText={set("name")} error={errors.name} autoCapitalize="words" autoComplete="name" maxLength={100} />
        <FormField
          label="Email"
          optional
          value={fields.email}
          onChangeText={set("email")}
          error={errors.email}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          maxLength={200}
        />
        {user ? (
          <View className="gap-1.5">
            <Text className="text-sm font-semibold">Phone number</Text>
            <Text className="text-[15px] text-muted-foreground">{formatPhone(user.phone)}</Text>
            <Text className="text-xs text-muted-foreground">You log in with this number, so it cannot be changed here.</Text>
          </View>
        ) : null}
      </ScrollView>

      <View className="gap-2 border-t border-border bg-card px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        {formError && <Text className="text-sm text-destructive">{formError}</Text>}
        <Button onPress={submit} disabled={save.isPending} className="h-12 rounded-lg">
          {save.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text className="text-base font-bold">Save</Text>}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
