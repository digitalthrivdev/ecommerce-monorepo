import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAppTheme } from "@/lib/app-theme";
import { openCategory } from "@/lib/navigation";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

const TILE_SURFACE = { outlined: "border border-border", elevated: "shadow-sm shadow-black/10", flat: "" } as const;

function rows<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
}

function CategoryTile({ category }: { category: Category }) {
  const { cardStyle } = useAppTheme();
  const [failed, setFailed] = useState(false);

  return (
    <Pressable onPress={() => openCategory(category)} className="flex-1 items-center gap-1.5 active:opacity-70" accessibilityRole="button" accessibilityLabel={category.name}>
      <View className={cn("aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-tile", TILE_SURFACE[cardStyle])}>
        {category.imageUrl && !failed ? (
          <Image source={{ uri: category.imageUrl }} style={{ width: "78%", height: "78%" }} contentFit="contain" onError={() => setFailed(true)} />
        ) : (
          <Text className="text-2xl font-extrabold text-primary">{category.name.charAt(0)}</Text>
        )}
      </View>
      <Text className="text-center text-xs font-semibold leading-tight" numberOfLines={2}>
        {category.name}
      </Text>
    </Pressable>
  );
}

type Columns = 3 | 4;

export function CategoryGridSkeleton({ columns = 4 }: { columns?: Columns }) {
  return (
    <View className="gap-4 px-4">
      {rows(Array.from({ length: columns * 2 }, (_, index) => index), columns).map((row, index) => (
        <View key={index} className="flex-row gap-3">
          {row.map((item) => (
            <View key={item} className="flex-1 gap-1.5">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="mx-2 h-3" />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function CategoryGrid({ categories, columns = 4 }: { categories: Category[]; columns?: Columns }) {
  if (categories.length === 0) {
    return <Text className="px-4 py-6 text-center text-sm text-muted-foreground">No categories yet.</Text>;
  }

  return (
    <View className="gap-4 px-4">
      {rows(categories, columns).map((row, index) => (
        <View key={index} className="flex-row gap-3">
          {row.map((category) => (
            <CategoryTile key={category.id} category={category} />
          ))}
          {Array.from({ length: columns - row.length }, (_, spacer) => (
            <View key={`spacer-${spacer}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}
