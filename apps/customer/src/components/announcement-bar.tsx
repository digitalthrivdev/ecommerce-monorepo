import { View } from "react-native";

import { Text } from "@/components/ui/text";
import { useAppTheme } from "@/lib/app-theme";
import { useSettings } from "@/lib/settings";

/** The admin's announcement line, full width under the category tabs; uses the primary colours unless custom ones are set. */
export function AnnouncementBar() {
  const { announcement } = useSettings();
  const { colors } = useAppTheme();
  if (!announcement.enabled || !announcement.text) return null;

  return (
    <View className="px-4 py-2" style={{ backgroundColor: announcement.backgroundColor ?? colors.primary }}>
      <Text className="text-center text-xs font-semibold" style={{ color: announcement.textColor ?? colors.onPrimary }} numberOfLines={2}>
        {announcement.text}
      </Text>
    </View>
  );
}
