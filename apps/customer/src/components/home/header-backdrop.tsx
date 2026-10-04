import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { vars } from "nativewind";
import { createContext, use, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Animated, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";

import { useAppTheme } from "@/lib/app-theme";
import { channels } from "@/lib/theme";
import type { TabHeader } from "@/lib/types";

const FADE_MS = 280;
const FADE_STRIP_HEIGHT = 16;

type Layers = { previous: TabHeader | null; current: TabHeader; generation: number };

const HeaderLookContext = createContext<(Layers & { height: number }) | null>(null);

function useHeaderLook() {
  const value = use(HeaderLookContext);
  if (!value) throw new Error("useHeaderLook must be used inside <HeaderLookProvider>");
  return value;
}

const lookKey = (look: TabHeader) => [look.color, look.gradientColor, look.textColor, look.imageUrl].join("|");

type HeaderLookProviderProps = PropsWithChildren<{
  look: TabHeader;
  /** The whole header's height, status bar to tab strip, so each part can draw its slice of one backdrop. */
  height: number;
}>;

/** The home header's colours and image. A new look fades in over the old one. */
export function HeaderLookProvider({ look, height, children }: HeaderLookProviderProps) {
  const [layers, setLayers] = useState<Layers>({ previous: null, current: look, generation: 0 });
  if (lookKey(layers.current) !== lookKey(look)) {
    setLayers({ previous: layers.current, current: look, generation: layers.generation + 1 });
  }

  useEffect(() => {
    if (!layers.previous) return;
    const generation = layers.generation;
    const timer = setTimeout(() => setLayers((now) => (now.generation === generation ? { ...now, previous: null } : now)), FADE_MS + 50);
    return () => clearTimeout(timer);
  }, [layers.previous, layers.generation]);

  const value = useMemo(() => ({ ...layers, height }), [layers, height]);
  return <HeaderLookContext value={value}>{children}</HeaderLookContext>;
}

/** Fades in when mounted with `animate`; later changes to `animate` are ignored. */
function FadeIn({ animate, children }: PropsWithChildren<{ animate: boolean }>) {
  const [hidden] = useState(animate);
  const [opacity] = useState(() => new Animated.Value(hidden ? 0 : 1));
  useEffect(() => {
    if (hidden) Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
  }, [hidden, opacity]);
  return <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>{children}</Animated.View>;
}

/** The full-height backdrop, shifted up by `offset` so the part above shows the matching slice. */
function Backdrop({ look, offset, height }: { look: TabHeader; offset: number; height: number }) {
  const box: ViewStyle = height > 0 ? { top: -offset, height } : { top: 0, bottom: 0 };
  return (
    <View style={[styles.backdrop, box, { backgroundColor: look.color }]}>
      {look.gradientColor && <LinearGradient colors={[look.color, look.gradientColor]} style={StyleSheet.absoluteFill} />}
      {look.imageUrl && <Image source={{ uri: look.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityIgnoresInvertColors />}
    </View>
  );
}

type HeaderRegionProps = PropsWithChildren<{
  /** Distance from the top of the header (the top of the status bar). */
  offset: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
  onLayout?: (event: LayoutChangeEvent) => void;
}>;

/**
 * One part of the home header: draws its slice of the backdrop, and recolours `highlight` text and
 * icons inside it to the current look.
 */
export function HeaderRegion({ offset, className, style, onLayout, children }: HeaderRegionProps) {
  const { previous, current, generation, height } = useHeaderLook();
  const colorVars = useMemo(() => vars({ "--highlight": channels(current.color), "--highlight-foreground": channels(current.textColor) }), [current.color, current.textColor]);

  return (
    <View style={[colorVars, style]} className={className} onLayout={onLayout}>
      <View style={styles.clip} pointerEvents="none">
        {previous && <Backdrop look={previous} offset={offset} height={height} />}
        <FadeIn key={generation} animate={previous !== null}>
          <Backdrop look={current} offset={offset} height={height} />
        </FadeIn>
      </View>
      {children}
    </View>
  );
}

/** Blends the bottom of the header into the page, or into `to`, e.g. the colour of a section band right below. */
export function HeaderFade({ to }: { to?: string }) {
  const { previous, current, generation } = useHeaderLook();
  const { neutral } = useAppTheme();
  const gradient = (look: TabHeader) => (
    <LinearGradient colors={[look.gradientColor ?? look.color, to ?? neutral.background]} style={StyleSheet.absoluteFill} />
  );

  return (
    <View style={{ height: FADE_STRIP_HEIGHT }} pointerEvents="none">
      {previous && gradient(previous)}
      <FadeIn key={generation} animate={previous !== null}>
        {gradient(current)}
      </FadeIn>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, overflow: "hidden" },
  backdrop: { position: "absolute", left: 0, right: 0 },
});
