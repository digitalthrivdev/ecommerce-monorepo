import { router } from "expo-router";
import { ArrowLeft, X } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

type ScreenHeaderProps = { title: string; close?: boolean; right?: ReactNode };

/** Title bar with a back button (or a close button for modals). */
export function ScreenHeader({ title, close = false, right }: ScreenHeaderProps) {
  return (
    <View className="h-14 flex-row items-center gap-2 px-2">
      <Pressable
        onPress={() => router.back()}
        className="size-11 items-center justify-center rounded-full active:bg-accent"
        accessibilityLabel={close ? "Close" : "Back"}
        hitSlop={8}
      >
        <Icon as={close ? X : ArrowLeft} size={22} />
      </Pressable>
      <Text className="flex-1 text-lg font-bold" numberOfLines={1}>
        {title}
      </Text>
      {right}
    </View>
  );
}
