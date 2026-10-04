import { Image } from "expo-image";
import { useState } from "react";
import { Animated, Pressable, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

import { SectionTitle } from "@/components/product-row";
import { Text } from "@/components/ui/text";
import { linkAction } from "@/lib/navigation";
import type { ImageTilesSection } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tile = ImageTilesSection["tiles"][number];

/** Share of the screen width taken by the middle carousel tile; the rest shows its neighbours. */
const CAROUSEL_WIDTH = 0.72;
const CAROUSEL_GAP = 12;
/** How small the neighbouring tiles are drawn. */
const SIDE_SCALE = 0.9;

function rows<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
}

function GridTile({ tile }: { tile: Tile }) {
  const onPress = linkAction(tile.link);
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="aspect-square flex-1 overflow-hidden rounded-lg bg-muted active:opacity-90">
      <Image source={{ uri: tile.imageUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
    </Pressable>
  );
}

function CarouselTile({ tile }: { tile: Tile }) {
  const onPress = linkAction(tile.link);
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="aspect-[4/5] w-full overflow-hidden rounded-xl bg-muted active:opacity-95">
      <Image source={{ uri: tile.imageUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
      {onPress && tile.buttonLabel && (
        <View className="absolute inset-x-0 bottom-4 items-center">
          <View className="rounded-lg bg-white px-5 py-2.5 shadow-sm shadow-black/30">
            <Text className="text-sm font-bold text-neutral-900">{tile.buttonLabel}</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** One large tile in the middle, the neighbours peeking in smaller at the sides. */
function Carousel({ tiles }: { tiles: Tile[] }) {
  const { width: screenWidth } = useWindowDimensions();
  const [scrollX] = useState(() => new Animated.Value(0));
  const [index, setIndex] = useState(0);

  const tileWidth = Math.round(screenWidth * CAROUSEL_WIDTH);
  const interval = tileWidth + CAROUSEL_GAP;
  const sidePadding = (screenWidth - tileWidth) / 2;

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.min(tiles.length - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / interval))));

  return (
    <View className="gap-2.5">
      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: sidePadding, gap: CAROUSEL_GAP }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={onScrollEnd}
      >
        {tiles.map((tile, position) => {
          const scale = scrollX.interpolate({
            inputRange: [(position - 1) * interval, position * interval, (position + 1) * interval],
            outputRange: [SIDE_SCALE, 1, SIDE_SCALE],
            extrapolate: "clamp",
          });
          return (
            <Animated.View key={tile.id} style={{ width: tileWidth, transform: [{ scale }] }}>
              <CarouselTile tile={tile} />
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
      <View className="flex-row justify-center gap-1.5">
        {tiles.map((tile, position) => (
          <View key={tile.id} className={cn("h-1.5 rounded-full", position === index ? "w-4 bg-primary" : "w-1.5 bg-border")} />
        ))}
      </View>
    </View>
  );
}

/** Promotional images, in a grid or a carousel; any text is part of the image. */
export function ImageTiles({ section }: { section: ImageTilesSection }) {
  return (
    <View>
      <SectionTitle title={section.title} description={section.description} />
      {section.layout === "carousel" ? (
        <Carousel tiles={section.tiles} />
      ) : (
        <View className="gap-3 px-4">
          {rows(section.tiles, section.columns).map((row, index) => (
            <View key={index} className="flex-row gap-3">
              {row.map((tile) => (
                <GridTile key={tile.id} tile={tile} />
              ))}
              {Array.from({ length: section.columns - row.length }, (_, spacer) => (
                <View key={`spacer-${spacer}`} className="flex-1" />
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
