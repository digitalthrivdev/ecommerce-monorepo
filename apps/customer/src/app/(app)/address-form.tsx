import { router, useLocalSearchParams } from "expo-router";
import { Check, LocateFixed } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusStatusBar } from "@/components/focus-status-bar";
import { FormField } from "@/components/form-field";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { addressCoordinates, useAddresses, useSaveAddress } from "@/lib/addresses";
import { ApiError, errorMessage } from "@/lib/api";
import { useAppTheme } from "@/lib/app-theme";
import { PHONE_COUNTRY_CODE, PHONE_NATIONAL_LENGTH } from "@/lib/config";
import { useDeliveryLocation } from "@/lib/delivery-location";
import { describePlace, getCurrentCoordinates } from "@/lib/location";
import { isValidNationalNumber, toE164 } from "@/lib/phone";
import { useSession } from "@/lib/session";
import type { Address, Coordinates } from "@/lib/types";
import { cn } from "@/lib/utils";

const LABELS = ["Home", "Work", "Other"] as const;

type Fields = {
  label: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
  name: string;
  phone: string;
};
type FieldErrors = Partial<Record<keyof Fields | "location", string>>;

const nationalPart = (e164: string) => (e164.startsWith(PHONE_COUNTRY_CODE) ? e164.slice(PHONE_COUNTRY_CODE.length) : "");

function initialFields(address: Address | undefined, user: { name: string | null; phone: string } | null): Fields {
  return {
    label: address?.label ?? "Home",
    addressLine1: address?.addressLine1 ?? "",
    addressLine2: address?.addressLine2 ?? "",
    landmark: address?.landmark ?? "",
    city: address?.city ?? "",
    state: address?.state ?? "",
    postalCode: address?.postalCode ?? "",
    name: address?.name ?? user?.name ?? "",
    phone: nationalPart(address?.phone ?? user?.phone ?? ""),
  };
}

function validate(fields: Fields, coordinates: Coordinates | null): FieldErrors {
  const errors: FieldErrors = {};
  if (!coordinates) errors.location = "We need your location to check that we deliver there.";
  if (!fields.addressLine1.trim()) errors.addressLine1 = "Enter your house or flat number";
  if (!fields.city.trim()) errors.city = "Enter the city";
  if (!fields.state.trim()) errors.state = "Enter the state";
  if (fields.postalCode.trim().length < 3) errors.postalCode = "Enter the PIN code";
  if (!fields.name.trim()) errors.name = "Enter the receiver's name";
  if (!isValidNationalNumber(fields.phone)) errors.phone = `Enter a ${PHONE_NATIONAL_LENGTH}-digit phone number`;
  return errors;
}

function AddressForm({ address, selectAfterSave }: { address?: Address; selectAfterSave: boolean }) {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { user } = useSession();
  const { selectAddress } = useDeliveryLocation();
  const save = useSaveAddress();
  const [fields, setFields] = useState(() => initialFields(address, user));
  const [coordinates, setCoordinates] = useState<Coordinates | null>(() => (address ? addressCoordinates(address) : null));
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [makeDefault, setMakeDefault] = useState(address?.isDefault ?? false);

  const set = (key: keyof Fields) => (value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  /** Pins the address to the phone's position and fills in the parts of the address the user hasn't typed. */
  const detect = useCallback(async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const found = await getCurrentCoordinates();
      setCoordinates(found);
      setErrors((current) => ({ ...current, location: undefined }));
      const place = await describePlace(found);
      if (place) {
        setFields((current) => ({
          ...current,
          addressLine2: current.addressLine2 || place.area || "",
          city: current.city || place.city || "",
          state: current.state || place.state || "",
          postalCode: current.postalCode || place.postalCode || "",
        }));
      }
    } catch (caught) {
      setLocationError(errorMessage(caught));
    } finally {
      setLocating(false);
    }
  }, []);

  const detectedOnOpen = useRef(false);
  useEffect(() => {
    if (address || detectedOnOpen.current) return;
    detectedOnOpen.current = true;
    detect();
  }, [address, detect]);

  async function submit() {
    setFormError(null);
    const found = validate(fields, coordinates);
    setErrors(found);
    if (Object.values(found).some(Boolean) || !coordinates) return;

    try {
      const saved = await save.mutateAsync({
        id: address?.id,
        input: {
          label: fields.label.trim() || null,
          name: fields.name.trim(),
          phone: toE164(fields.phone),
          addressLine1: fields.addressLine1.trim(),
          addressLine2: fields.addressLine2.trim() || null,
          landmark: fields.landmark.trim() || null,
          city: fields.city.trim(),
          state: fields.state.trim(),
          postalCode: fields.postalCode.trim(),
          ...coordinates,
          ...(makeDefault && { isDefault: true }),
        },
      });
      if (selectAfterSave) {
        selectAddress(saved);
        router.dismissAll();
      } else {
        router.back();
      }
    } catch (caught) {
      const issues = caught instanceof ApiError ? (caught.issues ?? []) : [];
      const byField = Object.fromEntries(issues.filter((issue) => issue.path in fields).map((issue) => [issue.path, issue.message]));
      setErrors(byField);
      setFormError(Object.keys(byField).length ? "Check the highlighted fields." : errorMessage(caught));
    }
  }

  const selectedLabel = (LABELS as readonly string[]).includes(fields.label) ? fields.label : "Other";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title={address ? "Edit address" : "Add address"} />
      <ScrollView contentContainerClassName="gap-5 px-4 pb-6 pt-2" keyboardShouldPersistTaps="handled">
        <View className={cn("gap-2 rounded-lg border bg-card px-4 py-3.5", errors.location ? "border-destructive" : "border-border")}>
          <View className="flex-row items-center gap-3">
            {locating ? <ActivityIndicator color={colors.primary} /> : <Icon as={coordinates ? Check : LocateFixed} size={20} className="text-primary" />}
            <Text className="flex-1 text-sm font-semibold">
              {locating ? "Finding your location…" : coordinates ? "Pinned to your location" : "Location not set"}
            </Text>
            <Pressable onPress={detect} disabled={locating} hitSlop={8}>
              <Text className="text-sm font-bold text-primary">{coordinates ? "Update" : "Detect"}</Text>
            </Pressable>
          </View>
          <Text className="text-xs text-muted-foreground">Stand at the delivery address when you set this, so the rider finds you easily.</Text>
          {(locationError || errors.location) && <Text className="text-xs text-destructive">{locationError ?? errors.location}</Text>}
        </View>

        <View className="gap-1.5">
          <Text className="text-sm font-semibold">Save as</Text>
          <View className="flex-row gap-2">
            {LABELS.map((label) => (
              <Pressable
                key={label}
                onPress={() => set("label")(label)}
                className={cn("rounded-full border px-4 py-2", selectedLabel === label ? "border-primary bg-primary/10" : "border-border bg-card")}
              >
                <Text className={cn("text-sm font-semibold", selectedLabel === label && "text-primary")}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <FormField label="House / flat / floor" value={fields.addressLine1} onChangeText={set("addressLine1")} error={errors.addressLine1} placeholder="Flat 4B, Sunrise Apartments" autoCapitalize="words" />
        <FormField label="Area / street / locality" optional value={fields.addressLine2} onChangeText={set("addressLine2")} error={errors.addressLine2} autoCapitalize="words" />
        <FormField label="Nearby landmark" optional value={fields.landmark} onChangeText={set("landmark")} error={errors.landmark} placeholder="Opposite the park" autoCapitalize="words" />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField label="City" value={fields.city} onChangeText={set("city")} error={errors.city} autoCapitalize="words" />
          </View>
          <View className="flex-1">
            <FormField label="PIN code" value={fields.postalCode} onChangeText={set("postalCode")} error={errors.postalCode} keyboardType="number-pad" maxLength={12} />
          </View>
        </View>
        <FormField label="State" value={fields.state} onChangeText={set("state")} error={errors.state} autoCapitalize="words" />

        <Text className="pt-2 text-base font-bold">Receiver details</Text>
        <FormField label="Name" value={fields.name} onChangeText={set("name")} error={errors.name} autoCapitalize="words" autoComplete="name" />
        <FormField
          label="Phone number"
          value={fields.phone}
          onChangeText={(value) => set("phone")(value.replace(/\D/g, ""))}
          error={errors.phone}
          keyboardType="phone-pad"
          maxLength={PHONE_NATIONAL_LENGTH}
          prefix={
            <View className="h-12 justify-center rounded-l-lg border border-r-0 border-input bg-muted px-3">
              <Text className="text-[15px] font-semibold">{PHONE_COUNTRY_CODE}</Text>
            </View>
          }
        />

        {!address?.isDefault && (
          <Pressable onPress={() => setMakeDefault((value) => !value)} className="flex-row items-center gap-3 py-1" hitSlop={4}>
            <View className={cn("size-5 items-center justify-center rounded border", makeDefault ? "border-primary bg-primary" : "border-input bg-card")}>
              {makeDefault && <Icon as={Check} size={14} className="text-primary-foreground" />}
            </View>
            <Text className="text-sm">Make this my default address</Text>
          </Pressable>
        )}
      </ScrollView>

      <View className="gap-2 border-t border-border bg-card px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        {formError && <Text className="text-sm text-destructive">{formError}</Text>}
        <Button onPress={submit} disabled={save.isPending} className="h-12 rounded-lg">
          {save.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text className="text-base font-bold">Save address</Text>}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

export default function AddressFormScreen() {
  const { id, select } = useLocalSearchParams<{ id?: string; select?: string }>();
  const addresses = useAddresses();
  const insets = useSafeAreaInsets();

  if (!id) return <AddressForm selectAfterSave={select === "1"} />;

  const address = addresses.data?.find((item) => item.id === id);
  if (address) return <AddressForm key={address.id} address={address} selectAfterSave={select === "1"} />;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Edit address" />
      {addresses.isPending ? (
        <View className="gap-4 px-4 pt-2">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </View>
      ) : addresses.isError ? (
        <QueryError error={addresses.error} onRetry={() => addresses.refetch()} />
      ) : (
        <Text className="px-8 py-10 text-center text-sm text-muted-foreground">This address no longer exists.</Text>
      )}
    </View>
  );
}
