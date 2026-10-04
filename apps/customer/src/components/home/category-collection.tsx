import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useBandText } from "@/components/home/section-band";
import { SectionTitle } from "@/components/product-row";
import { Text } from "@/components/ui/text";
import { useAppTheme } from "@/lib/app-theme";
import { smallImage } from "@/lib/images";
import { openCategory } from "@/lib/navigation";
import type { CategoryCollectionSection } from "@/lib/types";
import { cn } from "@/lib/utils";

type Item = CategoryCollectionSection["items"][number];

const TILE_SURFACE = { outlined: "border border-border", elevated: "shadow-sm shadow-black/10", flat: "" } as const;

function rows<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
}

function CollectionTile({ item, compact }: { item: Item; compact: boolean }) {
  const { cardStyle } = useAppTheme();
  const [failed, setFailed] = useState(false);
  const fallback = item.category.imageUrl;
  const bandText = useBandText();

  return (
    <Pressable onPress={() => openCategory(item.category)} className="flex-1 items-center gap-1.5 active:opacity-70" accessibilityRole="button" accessibilityLabel={item.label}>
      <View className={cn("aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-tile", TILE_SURFACE[cardStyle])}>
        {item.imageUrl && !failed ? (
          <Image source={{ uri: item.imageUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" onError={() => setFailed(true)} />
        ) : fallback ? (
          <Image source={{ uri: smallImage(fallback) }} style={{ width: "78%", height: "78%" }} contentFit="contain" />
        ) : (
          <Text className="text-2xl font-extrabold text-primary">{item.label.charAt(0)}</Text>
        )}
        {item.badge && (
          <View className="absolute left-0 top-0 rounded-br-lg bg-primary px-1.5 py-0.5">
            <Text className={cn("font-extrabold text-primary-foreground", compact ? "text-[8px]" : "text-[10px]")} numberOfLines={1}>
              {item.badge}
            </Text>
          </View>
        )}
      </View>
      <Text className={cn("text-center font-semibold leading-tight", compact ? "text-[11px]" : "text-xs")} style={bandText} numberOfLines={2}>
        {item.label}
      </Text>
    </Pressable>
  );
}

/** The admin's hand-picked categories in rows of `columns`. */
export function CategoryCollection({ section }: { section: CategoryCollectionSection }) {
  const compact = section.columns >= 5;
  return (
    <View>
      <SectionTitle title={section.title} description={section.description} />
      <View className="gap-4 px-4">
        {rows(section.items, section.columns).map((row, index) => (
          <View key={index} className={cn("flex-row", compact ? "gap-2" : "gap-3")}>
            {row.map((item) => (
              <CollectionTile key={item.id} item={item} compact={compact} />
            ))}
            {Array.from({ length: section.columns - row.length }, (_, spacer) => (
              <View key={`spacer-${spacer}`} className="flex-1" />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
