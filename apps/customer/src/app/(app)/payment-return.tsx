import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

/**
 * The payment page sends the browser back to this deep link. On iOS the in-app browser catches it
 * without opening a screen; on Android the app router also opens it, so step straight back to the
 * payment screen, or to the order if the app was restarted while the customer was paying.
 */
export default function PaymentReturnScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();

  useEffect(() => {
    if (router.canGoBack()) {
      router.back();
    } else if (orderId) {
      router.replace({ pathname: "/order/[id]", params: { id: orderId } });
    } else {
      router.replace("/");
    }
  }, [orderId]);

  return <View className="flex-1 bg-background" />;
}
