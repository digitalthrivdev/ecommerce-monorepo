import { router } from "expo-router";
import { MapPin, MapPinOff } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";

import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAppTheme } from "@/lib/app-theme";
import { useDeliveryLocation } from "@/lib/delivery-location";

/** Shown instead of products until there is a store for the delivery location. */
export function StoreRequired() {
  const { colors } = useAppTheme();
  const { location, ready, serviceability } = useDeliveryLocation();

  if (!ready || (location && serviceability.isPending)) {
    return <ActivityIndicator color={colors.primary} className="py-12" />;
  }
  if (location && serviceability.isError) {
    return <QueryError error={serviceability.error} onRetry={() => serviceability.refetch()} />;
  }

  return (
    <View className="items-center gap-3 px-8 py-12">
      <View className="size-16 items-center justify-center rounded-full bg-muted">
        <Icon as={location ? MapPinOff : MapPin} size={28} className="text-muted-foreground" />
      </View>
      <Text className="text-center text-lg font-extrabold">{location ? "We don't deliver here yet" : "Set your delivery location"}</Text>
      <Text className="text-center text-sm text-muted-foreground">
        {location ? `There's no store near ${location.summary}. Try another address.` : "Products and prices come from the store nearest to you."}
      </Text>
      <Button onPress={() => router.push("/location")} className="mt-1 h-11 rounded-lg px-6">
        <Text className="font-semibold">{location ? "Change location" : "Choose location"}</Text>
      </Button>
    </View>
  );
}
