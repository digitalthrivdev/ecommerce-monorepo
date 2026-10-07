export const isHexColor = (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value);

function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrastRatio(foreground: string, background: string) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

function darken(hex: string, amount: number) {
  const channel = (offset: number) => Math.round(Number.parseInt(hex.slice(offset, offset + 2), 16) * (1 - amount));
  return `#${[1, 3, 5].map((offset) => channel(offset).toString(16).padStart(2, "0")).join("")}`;
}

/** The colour, darkened just enough to read as normal-size text on `background` (WCAG AA, 4.5:1). */
export function readableOn(hex: string, background = "#FFFFFF") {
  if (!isHexColor(hex)) return hex;
  for (let amount = 0; amount <= 1; amount += 0.05) {
    const candidate = darken(hex, amount);
    if (contrastRatio(candidate, background) >= 4.5) return candidate;
  }
  return "#000000";
}
