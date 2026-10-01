import { router } from "expo-router";
import { ChevronRight, LocateFixed, Plus } from "lucide-react-native";
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AddressCard } from "@/components/address-card";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAddresses } from "@/lib/addresses";
import { errorMessage } from "@/lib/api";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { useDeliveryLocation, useLocateMe } from "@/lib/delivery-location";
import { LocationError } from "@/lib/location";
import { cn } from "@/lib/utils";

export default function LocationScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const surface = useCardSurface();
  const addresses = useAddresses();
  const { location, selectAddress } = useDeliveryLocation();
  const { locate, locating, error } = useLocateMe();

  async function pickCurrentLocation() {
    if (await locate()) router.back();
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title="Select delivery location" close />
      <ScrollView contentContainerClassName="gap-5 px-4 pb-10 pt-2">
        <View className={cn("overflow-hidden rounded-lg", surface)}>
          <Pressable onPress={pickCurrentLocation} disabled={locating} className="flex-row items-center gap-3 px-4 py-4 active:bg-accent">
            {locating ? <ActivityIndicator color={colors.primary} /> : <Icon as={LocateFixed} size={20} className="text-primary" />}
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-primary">{locating ? "Finding your location…" : "Use my current location"}</Text>
              {location?.kind === "current" && !locating && (
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  Now: {location.summary}
                </Text>
              )}
            </View>
            <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
          </Pressable>
          <View className="ml-12 h-px bg-border" />
          <Pressable onPress={() => router.push({ pathname: "/address-form", params: { select: "1" } })} className="flex-row items-center gap-3 px-4 py-4 active:bg-accent">
            <Icon as={Plus} size={20} className="text-primary" />
            <Text className="flex-1 text-[15px] font-bold text-primary">Add new address</Text>
            <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
          </Pressable>
        </View>

        {error ? (
          <View className="gap-2 rounded-lg bg-destructive/10 px-4 py-3">
            <Text className="text-sm text-destructive">{errorMessage(error)}</Text>
            {error instanceof LocationError && error.reason === "denied" && (
              <Pressable onPress={() => Linking.openSettings()} hitSlop={6}>
                <Text className="text-sm font-bold text-destructive">Open settings</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <View className="gap-3">
          <Text className="px-1 text-sm font-semibold text-muted-foreground">Saved addresses</Text>
          {addresses.isPending ? (
            <>
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </>
          ) : addresses.isError ? (
            <QueryError error={addresses.error} onRetry={() => addresses.refetch()} />
          ) : addresses.data.length === 0 ? (
            <Text className="px-1 text-sm text-muted-foreground">You haven&apos;t saved any addresses yet.</Text>
          ) : (
            addresses.data.map((address) => (
              <AddressCard
                key={address.id}
                address={address}
                selected={location?.kind === "address" && location.addressId === address.id}
                onPress={() =>
                  selectAddress(address) ? router.back() : router.push({ pathname: "/address-form", params: { id: address.id, select: "1" } })
                }
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
