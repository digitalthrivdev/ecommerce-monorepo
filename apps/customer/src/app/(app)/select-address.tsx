import { router } from "expo-router";
import { ChevronRight, Plus } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AddressCard } from "@/components/address-card";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useDeliveryAddress } from "@/lib/addresses";
import { useCardSurface } from "@/lib/app-theme";
import { cn } from "@/lib/utils";

export default function SelectAddressScreen() {
  const insets = useSafeAreaInsets();
  const surface = useCardSurface();
  const { address: selected, addresses, select } = useDeliveryAddress();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title="Select delivery address" close />
      <ScrollView contentContainerClassName="gap-5 px-4 pb-10 pt-2">
        <View className={cn("overflow-hidden rounded-lg", surface)}>
          <Pressable onPress={() => router.push({ pathname: "/address-form", params: { select: "1" } })} className="flex-row items-center gap-3 px-4 py-4 active:bg-accent">
            <Icon as={Plus} size={20} className="text-primary" />
            <Text className="flex-1 text-[15px] font-bold text-primary">Add new address</Text>
            <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
          </Pressable>
        </View>

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
                selected={address.id === selected?.id}
                onPress={() => {
                  select(address);
                  router.back();
                }}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
