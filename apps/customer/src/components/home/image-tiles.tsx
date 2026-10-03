import { Image } from "expo-image";
import { Pressable, View } from "react-native";

import { Text } from "@/components/ui/text";
import { linkAction } from "@/lib/navigation";
import type { ImageTilesSection } from "@/lib/types";

type Tile = ImageTilesSection["tiles"][number];

function rows<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
}

function ImageTile({ tile }: { tile: Tile }) {
  const onPress = linkAction(tile.link);
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="aspect-square flex-1 overflow-hidden rounded-lg bg-muted active:opacity-90">
      <Image source={{ uri: tile.imageUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
    </Pressable>
  );
}

/** Square promotional images in a grid; any text is part of the image. */
export function ImageTiles({ section }: { section: ImageTilesSection }) {
  return (
    <View>
      {section.title && <Text className="px-4 pb-3 text-lg font-extrabold">{section.title}</Text>}
      <View className="gap-3 px-4">
        {rows(section.tiles, section.columns).map((row, index) => (
          <View key={index} className="flex-row gap-3">
            {row.map((tile) => (
              <ImageTile key={tile.id} tile={tile} />
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
