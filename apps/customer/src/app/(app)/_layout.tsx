import { Stack } from "expo-router";

import { DeliveryLocationProvider } from "@/lib/delivery-location";

export default function AppLayout() {
  return (
    <DeliveryLocationProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="location" options={{ presentation: "modal" }} />
        <Stack.Screen name="addresses" />
        <Stack.Screen name="address-form" />
      </Stack>
    </DeliveryLocationProvider>
  );
}
