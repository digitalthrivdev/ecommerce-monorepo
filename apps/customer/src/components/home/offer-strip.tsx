import { Image } from "expo-image";
import { ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { linkAction } from "@/lib/navigation";
import type { OfferStripSection } from "@/lib/types";

export function OfferStrip({ section }: { section: OfferStripSection }) {
  const [failed, setFailed] = useState(false);
  const onPress = linkAction(section.link);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="mx-4 flex-row items-center gap-3 overflow-hidden rounded-lg px-4 py-3.5 active:opacity-90"
      style={{ backgroundColor: section.backgroundColor }}
    >
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-extrabold leading-tight" style={{ color: section.textColor }} numberOfLines={2}>
          {section.title}
        </Text>
        {section.subtitle && (
          <Text className="text-xs opacity-85" style={{ color: section.textColor }} numberOfLines={2}>
            {section.subtitle}
          </Text>
        )}
      </View>
      {section.imageUrl && !failed && (
        <Image source={{ uri: section.imageUrl }} style={{ width: 56, height: 56 }} contentFit="contain" onError={() => setFailed(true)} />
      )}
      {onPress && <ChevronRight size={18} color={section.textColor} />}
    </Pressable>
  );
}
