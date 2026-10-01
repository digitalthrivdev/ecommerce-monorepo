import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

import { Text } from "@/components/ui/text";
import { linkAction } from "@/lib/navigation";
import type { BannerCarouselSection } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIDE_PADDING = 16;
const GAP = 12;
const AUTOPLAY_MS = 4000;

type Banner = BannerCarouselSection["banners"][number];

function BannerSlide({ banner, width }: { banner: Banner; width: number }) {
  const hasCaption = Boolean(banner.title || banner.subtitle);
  const onPress = linkAction(banner.link);

  return (
    <Pressable onPress={onPress} disabled={!onPress} className="overflow-hidden rounded-lg bg-muted active:opacity-90" style={{ width, aspectRatio: 2 }}>
      <Image source={{ uri: banner.imageUrl }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
      {hasCaption && (
        <LinearGradient colors={["transparent", "rgba(0,0,0,0.6)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, gap: 2, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 32 }}>
          {banner.title && (
            <Text className="text-lg font-extrabold leading-tight text-white" numberOfLines={2}>
              {banner.title}
            </Text>
          )}
          {banner.subtitle && (
            <Text className="text-xs text-white/90" numberOfLines={2}>
              {banner.subtitle}
            </Text>
          )}
        </LinearGradient>
      )}
    </Pressable>
  );
}

/** Swipeable banners; autoplay pauses while the user drags or the screen is in the background. */
export function BannerCarousel({ section }: { section: BannerCarouselSection }) {
  const { width: screenWidth } = useWindowDimensions();
  const focused = useIsFocused();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);

  const slideWidth = screenWidth - SIDE_PADDING * 2;
  const interval = slideWidth + GAP;
  const count = section.banners.length;

  useEffect(() => {
    if (!section.autoplay || count < 2 || dragging || !focused) return;
    const timer = setTimeout(() => {
      const next = (index + 1) % count;
      scrollRef.current?.scrollTo({ x: next * interval, animated: true });
      setIndex(next);
    }, AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [section.autoplay, count, dragging, focused, index, interval]);

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setDragging(false);
    setIndex(Math.min(count - 1, Math.max(0, Math.round(event.nativeEvent.contentOffset.x / interval))));
  };

  return (
    <View className="gap-2">
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval}
        decelerationRate="fast"
        disableIntervalMomentum
        contentContainerStyle={{ paddingHorizontal: SIDE_PADDING, gap: GAP }}
        onScrollBeginDrag={() => setDragging(true)}
        onMomentumScrollEnd={onScrollEnd}
      >
        {section.banners.map((banner) => (
          <BannerSlide key={banner.id} banner={banner} width={slideWidth} />
        ))}
      </ScrollView>
      {count > 1 && (
        <View className="flex-row justify-center gap-1.5">
          {section.banners.map((banner, position) => (
            <View key={banner.id} className={cn("h-1.5 rounded-full", position === index ? "w-4 bg-primary" : "w-1.5 bg-border")} />
          ))}
        </View>
      )}
    </View>
  );
}
