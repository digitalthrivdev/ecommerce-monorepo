import { Image } from "expo-image";
import { useIsFocused } from "expo-router/react-navigation";
import { Heart, Snowflake, Sparkle, type LucideIcon } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View, type TextStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { useBandText } from "@/components/home/section-band";
import { Text } from "@/components/ui/text";
import { useCardSurface } from "@/lib/app-theme";
import { defaultVariant } from "@/lib/catalog";
import { discountPercent, formatMoney } from "@/lib/format";
import { smallImage } from "@/lib/images";
import { openCategory, openProduct } from "@/lib/navigation";
import { useSettings } from "@/lib/settings";
import { TAB_ICONS } from "@/lib/tab-icons";
import type { SaleHeroEffect, SaleHeroSection } from "@/lib/types";
import { cn } from "@/lib/utils";

const TITLE_LOOP_MS = 2400;
const PARTICLE_LOOP_MS = 9000;
const DEAL_MS = 2600;
const DEAL_FADE_MS = 220;
const CONFETTI_COLORS = ["#FFD54F", "#4FC3F7", "#F06292", "#81C784", "#FFFFFF"];
const PARTICLE_ICONS: Partial<Record<SaleHeroEffect, LucideIcon>> = { snow: Snowflake, sparkles: Sparkle, hearts: Heart };

/** A value running from 0 to 1 every `duration` ms while `running`; it carries on from where it paused. */
function useLoop(duration: number, running: boolean) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!running) return;
    const linear = { easing: Easing.linear };
    progress.set(
      withSequence(
        withTiming(1, { duration: (1 - progress.get()) * duration, ...linear }),
        withTiming(0, { duration: 0 }),
        withRepeat(withTiming(1, { duration, ...linear }), -1),
      ),
    );
    return () => cancelAnimation(progress);
  }, [duration, running, progress]);
  return progress;
}

/** Stable pseudo-random numbers, so particles keep their places between renders. */
const random = (seed: number) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

type ParticleSeed = { x: number; y: number; phase: number; speed: number; size: number; sway: number; opacity: number; color: string };

const PARTICLES: ParticleSeed[] = Array.from({ length: 14 }, (_, index) => ({
  x: random(index + 1),
  y: random(index + 11),
  phase: random(index + 21),
  speed: random(index + 31) > 0.6 ? 2 : 1,
  size: 9 + Math.round(random(index + 41) * 8),
  sway: 4 + random(index + 51) * 10,
  opacity: 0.45 + random(index + 61) * 0.4,
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length]!,
}));

type ParticleProps = { seed: ParticleSeed; progress: SharedValue<number>; effect: SaleHeroEffect; color: string; width: number; height: number };

/** Snow and confetti fall, hearts rise, sparkles twinkle in place. */
function Particle({ seed, progress, effect, color, width, height }: ParticleProps) {
  const style = useAnimatedStyle(() => {
    const local = (progress.get() * seed.speed + seed.phase) % 1;
    const sway = Math.sin((local * 2 + seed.phase) * Math.PI * 2) * seed.sway;
    if (effect === "sparkles") {
      const pulse = Math.sin(local * Math.PI);
      return { opacity: pulse * seed.opacity, transform: [{ translateX: seed.x * width }, { translateY: seed.y * height }, { scale: 0.4 + pulse * 0.6 }] };
    }
    const fade = Math.min(1, local / 0.15, (1 - local) / 0.15);
    const travel = local * (height + seed.size * 2) - seed.size;
    return {
      opacity: fade * seed.opacity,
      transform: [
        { translateX: seed.x * width + sway },
        { translateY: effect === "hearts" ? height - travel : travel },
        { rotate: `${local * (effect === "confetti" ? 720 : 180)}deg` },
      ],
    };
  });

  const Glyph = PARTICLE_ICONS[effect];
  return (
    <Animated.View style={[styles.particle, style]}>
      {Glyph ? (
        <Glyph size={seed.size} color={color} fill={effect === "hearts" ? color : "transparent"} strokeWidth={effect === "hearts" ? 0 : 2} />
      ) : (
        <View style={{ width: seed.size * 0.5, height: seed.size * 0.9, borderRadius: 2, backgroundColor: seed.color }} />
      )}
    </Animated.View>
  );
}

function Particles({ effect, color, running }: { effect: SaleHeroEffect; color: string; running: boolean }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const progress = useLoop(PARTICLE_LOOP_MS, running);
  return (
    <View style={styles.particles} pointerEvents="none" onLayout={(event) => setSize(event.nativeEvent.layout)}>
      {size.width > 0 &&
        PARTICLES.map((seed, index) => <Particle key={index} seed={seed} progress={progress} effect={effect} color={color} width={size.width} height={size.height} />)}
    </View>
  );
}

/** Each letter hops in turn, then the word rests until the loop comes round again. */
function WaveLetter({ letter, index, stagger, progress, style }: { letter: string; index: number; stagger: number; progress: SharedValue<number>; style: TextStyle }) {
  const hop = useAnimatedStyle(() => {
    const local = (((progress.get() - index * stagger) % 1) + 1) % 1;
    return { transform: [{ translateY: local < 0.14 ? -Math.sin((local / 0.14) * Math.PI) * 7 : 0 }] };
  });
  return <Animated.Text style={[style, hop]}>{letter}</Animated.Text>;
}

function SideIcon({ icon, color, progress, mirrored }: { icon: LucideIcon; color: string; progress: SharedValue<number>; mirrored?: boolean }) {
  const Glyph = icon;
  const twinkle = useAnimatedStyle(() => {
    const beat = Math.sin(progress.get() * Math.PI * 4);
    return { transform: [{ scale: 1 + beat * 0.12 }, { rotate: `${(mirrored ? -1 : 1) * beat * 8}deg` }] };
  });
  return (
    <Animated.View style={twinkle}>
      <Glyph size={24} color={color} fill={color} />
    </Animated.View>
  );
}

const titleShadow: TextStyle = { textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1 };

function HeroTitle({ section, running }: { section: SaleHeroSection; running: boolean }) {
  const { width } = useWindowDimensions();
  const progress = useLoop(TITLE_LOOP_MS, running);
  const letters = Array.from(section.title);
  const Icon = section.icon ? TAB_ICONS[section.icon] : undefined;
  const fontSize = Math.min(36, (width - (Icon ? 112 : 48)) / (letters.length * 0.72));
  const style: TextStyle = { ...titleShadow, color: section.titleColor, fontSize, lineHeight: fontSize * 1.2, fontWeight: "900", letterSpacing: 0.5 };
  const stagger = Math.min(0.07, 0.6 / letters.length);

  return (
    <View className="flex-row items-center justify-center gap-2" accessibilityRole="header" accessibilityLabel={section.title}>
      {Icon && <SideIcon icon={Icon} color={section.titleColor} progress={progress} />}
      <View className="flex-row" importantForAccessibility="no-hide-descendants">
        {section.animateTitle && running ? (
          letters.map((letter, index) => <WaveLetter key={index} letter={letter} index={index} stagger={stagger} progress={progress} style={style} />)
        ) : (
          <Text style={style}>{section.title}</Text>
        )}
      </View>
      {Icon && <SideIcon icon={Icon} color={section.titleColor} progress={progress} mirrored />}
    </View>
  );
}

type Deals = NonNullable<SaleHeroSection["deals"]>;

/** Cycles through the biggest deals, fading between them. */
function DealCard({ deals, titleColor, running }: { deals: Deals; titleColor: string; running: boolean }) {
  const { currency } = useSettings();
  const [index, setIndex] = useState(0);
  const opacity = useSharedValue(1);
  const count = deals.products.length;

  useEffect(() => {
    if (!running || count < 2) return;
    let swap: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      opacity.set(withTiming(0, { duration: DEAL_FADE_MS }));
      swap = setTimeout(() => {
        setIndex((current) => (current + 1) % count);
        opacity.set(withTiming(1, { duration: DEAL_FADE_MS }));
      }, DEAL_FADE_MS);
    }, DEAL_MS);
    return () => {
      clearTimeout(timer);
      if (swap) clearTimeout(swap);
      opacity.set(withTiming(1, { duration: DEAL_FADE_MS }));
    };
  }, [running, count, index, opacity]);

  const fade = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const product = deals.products[index % count]!;
  const variant = defaultVariant(product.variants);
  const imageUrl = variant?.imageUrl ?? product.imageUrl;
  const discount = variant ? discountPercent(variant.sellingPrice, variant.mrp) : null;

  return (
    <Pressable
      onPress={() => openProduct(product.productId, variant?.variantId)}
      className="w-[31%] items-center rounded-lg bg-black/15 p-2 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`${deals.label}: ${product.name}`}
    >
      <Text className="text-center text-[15px] font-black uppercase leading-tight" style={[titleShadow, { color: titleColor }]} numberOfLines={2}>
        {deals.label}
      </Text>
      <Animated.View style={[styles.deal, fade]}>
        {variant && (
          <View className="mt-2 items-center gap-0.5">
            {discount && variant.mrp && (
              <View className="rounded bg-black/50 px-1.5">
                <Text className="text-[10px] font-semibold text-white line-through">{formatMoney(variant.mrp, currency)}</Text>
              </View>
            )}
            <View className="rounded bg-primary px-2 py-0.5">
              <Text className="text-sm font-extrabold text-primary-foreground">{formatMoney(variant.sellingPrice, currency)}</Text>
            </View>
          </View>
        )}
        <Text className="mt-1.5 text-center text-[11px] font-bold leading-tight" style={{ color: titleColor }} numberOfLines={2}>
          {product.name}
        </Text>
        <View className="mt-auto aspect-square w-full items-center justify-center rounded-md bg-white pt-0.5">
          {imageUrl ? (
            <Image source={{ uri: smallImage(imageUrl) }} style={{ width: "82%", height: "82%" }} contentFit="contain" />
          ) : (
            <Text className="text-2xl font-extrabold text-primary">{product.name.charAt(0)}</Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

type Tile = SaleHeroSection["categories"][number];

function DealTile({ category }: { category: Tile }) {
  const surface = useCardSurface();
  const images = category.imageUrls.length > 0 ? category.imageUrls : category.imageUrl ? [category.imageUrl] : [];
  return (
    <Pressable
      onPress={() => openCategory(category)}
      className={cn("flex-1 items-center gap-1 overflow-hidden rounded-lg px-1.5 pb-2 active:opacity-80", surface)}
      accessibilityRole="button"
      accessibilityLabel={category.maxDiscountPercent > 0 ? `${category.name}, up to ${category.maxDiscountPercent}% off` : category.name}
    >
      {category.maxDiscountPercent > 0 ? (
        <View className="rounded-b-md bg-primary px-2 py-0.5">
          <Text className="text-[10px] font-extrabold text-primary-foreground">UP TO {category.maxDiscountPercent}% OFF</Text>
        </View>
      ) : (
        <View className="h-5" />
      )}
      <Text className="text-center text-[13px] font-bold leading-tight" numberOfLines={2}>
        {category.name}
      </Text>
      <View className="mt-auto flex-row justify-center gap-1">
        {images.slice(0, 4).map((url) => (
          <Image key={url} source={{ uri: smallImage(url) }} style={{ width: 24, height: 24 }} contentFit="contain" />
        ))}
        {images.length === 0 && category.imageUrl ? (
          <Image source={{ uri: smallImage(category.imageUrl) }} style={{ width: 40, height: 40 }} contentFit="contain" />
        ) : null}
        {images.length === 0 && !category.imageUrl ? (
          <Text className="text-2xl font-extrabold text-primary">{category.name.charAt(0)}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function pairs<T>(items: T[]) {
  return Array.from({ length: Math.ceil(items.length / 2) }, (_, row) => items.slice(row * 2, row * 2 + 2));
}

/** A festive sale block: animated title over drifting shapes, a card cycling deals, and category tiles. */
export function SaleHero({ section }: { section: SaleHeroSection }) {
  const focused = useIsFocused();
  const reduceMotion = useReducedMotion();
  const running = focused && !reduceMotion;
  const bandText = useBandText();
  const hasCards = section.deals !== null || section.categories.length > 0;

  return (
    <View className="overflow-hidden">
      {section.effect !== "none" && !reduceMotion && <Particles effect={section.effect} color={section.titleColor} running={running} />}
      <View className="items-center px-4">
        <HeroTitle section={section} running={running} />
        {section.subtitle && (
          <Text className="text-xl font-black uppercase" style={[titleShadow, { color: section.titleColor }]}>
            {section.subtitle}
          </Text>
        )}
        {section.tagline && (
          <Text className="mt-1 text-xs font-bold text-muted-foreground" style={bandText}>
            {section.tagline}
          </Text>
        )}
      </View>
      {hasCards && (
        <View className="mt-4 flex-row gap-2.5 px-4">
          {section.deals && <DealCard deals={section.deals} titleColor={section.titleColor} running={running} />}
          {section.categories.length > 0 && (
            <View className="flex-1 gap-2.5">
              {pairs(section.categories).map((row) => (
                <View key={row.map((category) => category.id).join()} className="min-h-24 flex-1 flex-row gap-2.5">
                  {row.map((category) => (
                    <DealTile key={category.id} category={category} />
                  ))}
                  {row.length === 1 && <View className="flex-1" />}
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  particles: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" },
  particle: { position: "absolute", left: 0, top: 0 },
  deal: { flex: 1, width: "100%", alignItems: "center" },
});
