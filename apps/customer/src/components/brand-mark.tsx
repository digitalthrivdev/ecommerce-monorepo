import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { smallImage } from "@/lib/images";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { logo: 22, text: "text-base" },
  lg: { logo: 72, text: "text-3xl" },
} as const;

/** The admin's logo next to the app name; just the name when there is no logo or it fails to load. */
type BrandMarkProps = { size?: keyof typeof SIZES; vertical?: boolean; className?: string; textClassName?: string };

export function BrandMark({ size = "sm", vertical = false, className, textClassName }: BrandMarkProps) {
  const { appName, branding } = useSettings();
  const [failed, setFailed] = useState(false);
  const { logo, text } = SIZES[size];
  const showLogo = Boolean(branding.logoUrl) && !failed;

  return (
    <View className={cn(vertical ? "items-center gap-3" : "flex-row items-center gap-2", className)}>
      {showLogo && (
        <Image
          source={{ uri: smallImage(branding.logoUrl!) }}
          style={{ width: logo, height: logo, borderRadius: size === "lg" ? 16 : 6 }}
          contentFit="contain"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      )}
      <Text className={cn(text, "font-extrabold tracking-tight", textClassName)} numberOfLines={1}>
        {appName}
      </Text>
    </View>
  );
}
