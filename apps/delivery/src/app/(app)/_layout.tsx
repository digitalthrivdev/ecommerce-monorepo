import { Stack } from "expo-router";

import { IncomingDelivery } from "@/components/incoming-delivery";
import { usePushNotifications } from "@/lib/push";

export default function AppLayout() {
  usePushNotifications();

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="delivery/[id]" />
      </Stack>
      <IncomingDelivery />
    </>
  );
}
