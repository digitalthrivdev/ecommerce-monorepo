import { createContext, use, type PropsWithChildren } from "react";
import { useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import type { SectionBackground } from "@/lib/types";

const BandContext = createContext<SectionBackground | null>(null);

/** Colour for text drawn straight on a section's band, e.g. its title; undefined on the plain page. */
export function useBandText(muted = false) {
  const band = use(BandContext);
  if (!band) return undefined;
  return muted ? { color: band.textColor, opacity: 0.8 } : { color: band.textColor };
}

const EDGE_HEIGHT = 10;

/** The shape hanging below a band: teeth for a paper cut, or a wave. Mirrors the dashboard preview. */
function edgePath(edge: "zigzag" | "wave", width: number, height: number) {
  const tooth = edge === "zigzag" ? 14 : 32;
  const count = Math.ceil(width / tooth);
  let path = "M0,0";
  for (let index = 0; index < count; index++) {
    const x = index * tooth;
    path += edge === "zigzag" ? ` L${x + tooth / 2},${height} L${x + tooth},0` : ` Q${x + tooth / 2},${height * 2} ${x + tooth},0`;
  }
  return `${path} Z`;
}

type SectionBandProps = PropsWithChildren<{ background: SectionBackground | null; first: boolean; joinsPrevious: boolean }>;

/**
 * Spacing above a home section, and its coloured band when it has one. Consecutive bands touch so the
 * colour runs on; the edge hangs over whatever comes next.
 */
export function SectionBand({ background, first, joinsPrevious, children }: SectionBandProps) {
  const { width } = useWindowDimensions();
  const marginTop = first || joinsPrevious ? 0 : 24;

  if (!background) return <View style={{ marginTop }}>{children}</View>;

  const edge = background.edge === "straight" ? null : background.edge;
  return (
    <View style={{ marginTop, paddingVertical: 20, backgroundColor: background.color, zIndex: edge ? 1 : 0 }}>
      <BandContext value={background}>{children}</BandContext>
      {edge && (
        <Svg width={width} height={EDGE_HEIGHT} style={{ position: "absolute", left: 0, bottom: -EDGE_HEIGHT + 1 }} pointerEvents="none">
          <Path d={edgePath(edge, width, EDGE_HEIGHT)} fill={background.color} />
        </Svg>
      )}
    </View>
  );
}
