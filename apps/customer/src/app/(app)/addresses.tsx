import { router } from "expo-router";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react-native";
import { Alert, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AddressCard } from "@/components/address-card";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { addressLabel, useAddresses, useDeleteAddress } from "@/lib/addresses";
import { errorMessage } from "@/lib/api";
import { useAppTheme } from "@/lib/app-theme";
import { useDeliveryLocation } from "@/lib/delivery-location";
import type { Address } from "@/lib/types";

export default function AddressesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const addresses = useAddresses();
  const remove = useDeleteAddress();
  const { location } = useDeliveryLocation();

  function confirmDelete(address: Address) {
    Alert.alert(`Delete "${addressLabel(address)}"?`, "This address will be removed from your account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => remove.mutate(address.id, { onError: (error) => Alert.alert("Couldn't delete the address", errorMessage(error)) }),
      },
    ]);
  }

  const addNew = () => router.push("/address-form");

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title="Saved addresses" />
      <ScrollView
        contentContainerClassName="gap-3 px-4 pb-10 pt-2"
        refreshControl={<RefreshControl refreshing={addresses.isRefetching} onRefresh={() => addresses.refetch()} tintColor={colors.primary} />}
      >
        {addresses.isPending ? (
          <>
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </>
        ) : addresses.isError ? (
          <QueryError error={addresses.error} onRetry={() => addresses.refetch()} />
        ) : addresses.data.length === 0 ? (
          <View className="items-center gap-3 px-6 py-12">
            <View className="size-16 items-center justify-center rounded-full bg-muted">
              <Icon as={MapPin} size={28} className="text-muted-foreground" />
            </View>
            <Text className="text-lg font-bold">No saved addresses</Text>
            <Text className="text-center text-sm text-muted-foreground">Add an address to get groceries delivered to your door.</Text>
          </View>
        ) : (
          addresses.data.map((address) => (
            <AddressCard
              key={address.id}
              address={address}
              selected={location?.kind === "address" && location.addressId === address.id}
              actions={
                <View className="gap-1">
                  <Pressable
                    onPress={() => router.push({ pathname: "/address-form", params: { id: address.id } })}
                    className="size-9 items-center justify-center rounded-full active:bg-accent"
                    accessibilityLabel={`Edit ${addressLabel(address)}`}
                    hitSlop={4}
                  >
                    <Icon as={Pencil} size={17} />
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDelete(address)}
                    disabled={remove.isPending && remove.variables === address.id}
                    className="size-9 items-center justify-center rounded-full active:bg-accent"
                    accessibilityLabel={`Delete ${addressLabel(address)}`}
                    hitSlop={4}
                  >
                    <Icon as={Trash2} size={17} className="text-destructive" />
                  </Pressable>
                </View>
              }
            />
          ))
        )}

        <Button variant="outline" onPress={addNew} className="mt-2 h-12 rounded-lg">
          <Icon as={Plus} size={18} className="text-primary" />
          <Text className="font-semibold text-primary">Add new address</Text>
        </Button>
      </ScrollView>
    </View>
  );
}
