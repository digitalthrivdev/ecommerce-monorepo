import { Link, Stack } from "expo-router";
import { View } from "react-native";

import { Text } from "@/components/ui/text";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
        <Text className="text-xl font-bold">This page doesn&apos;t exist</Text>
        <Link href="/" className="text-base font-semibold text-primary">
          Go to the home screen
        </Link>
      </View>
    </>
  );
}
