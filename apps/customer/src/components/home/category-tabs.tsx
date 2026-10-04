import { Image } from "expo-image";
import { ShoppingBasket, type LucideIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { smallImage } from "@/lib/images";
import { openCategory } from "@/lib/navigation";
import { TAB_ICONS } from "@/lib/tab-icons";
import type { CategoryTab } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON_SIZE = 22;

function TabButton({ label, selected, badge, onPress, children }: { label: string; selected?: boolean; badge?: string | null; onPress?: () => void; children: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="min-w-16 max-w-24 items-center gap-1 px-2 pb-2 pt-2.5 active:opacity-70"
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <View className="size-6 items-center justify-center">{children}</View>
      <Text className={cn("text-xs text-highlight-foreground", selected ? "font-extrabold" : "font-medium opacity-80")} numberOfLines={1}>
        {label}
      </Text>
      {selected && <View className="absolute bottom-0 h-[3px] w-10 rounded-t-full bg-highlight-foreground" />}
      {badge && (
        <View className="absolute right-0 top-0 rounded-full bg-destructive px-1.5 py-px">
          <Text className="text-[9px] font-extrabold text-white">{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

function TabIcon({ tab }: { tab: CategoryTab }) {
  const [failed, setFailed] = useState(false);
  const preset: LucideIcon | undefined = tab.icon?.type === "preset" ? TAB_ICONS[tab.icon.name] : undefined;

  if (preset) return <Icon as={preset} size={ICON_SIZE} className="text-highlight-foreground" />;
  if (tab.icon?.type === "image" && !failed) {
    return <Image source={{ uri: smallImage(tab.icon.url) }} style={{ width: ICON_SIZE + 2, height: ICON_SIZE + 2 }} contentFit="contain" onError={() => setFailed(true)} />;
  }
  return <Text className="text-lg font-extrabold leading-tight text-highlight-foreground">{tab.category.name.charAt(0)}</Text>;
}

/** Whether the tab shows its own page in the home screen rather than opening the category screen. */
export const opensPage = (tab: CategoryTab) => tab.opens === "page" && Boolean(tab.header);

type CategoryTabsProps = {
  tabs: CategoryTab[];
  /** The tab whose page is shown; null for "All". */
  selectedId: string | null;
  onSelect: (tab: CategoryTab | null) => void;
};

/** Category shortcuts under the search bar. "All" is the home screen itself; other tabs show their page or open their category. */
export function CategoryTabs({ tabs, selectedId, onSelect }: CategoryTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-2" accessibilityRole="tablist">
      <TabButton label="All" selected={selectedId === null} onPress={() => onSelect(null)}>
        <Icon as={ShoppingBasket} size={ICON_SIZE} className="text-highlight-foreground" />
      </TabButton>
      {tabs.map((tab) => (
        <TabButton
          key={tab.id}
          label={tab.label}
          badge={tab.badge}
          selected={tab.id === selectedId}
          onPress={() => (opensPage(tab) ? onSelect(tab) : openCategory(tab.category))}
        >
          <TabIcon tab={tab} />
        </TabButton>
      ))}
    </ScrollView>
  );
}
