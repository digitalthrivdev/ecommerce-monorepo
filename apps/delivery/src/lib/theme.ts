import { DarkTheme, DefaultTheme, type Theme } from "expo-router/react-navigation";

import type { AppTheme } from "./types";

export type Scheme = "light" | "dark";

/** Mirrors the neutral palettes in global.css, for places that need a colour value rather than a class. */
export const NEUTRAL: Record<Scheme, { background: string; foreground: string; card: string; border: string; muted: string; mutedForeground: string; destructive: string }> = {
  light: {
    background: "#F5F6F8",
    foreground: "#1C1C1C",
    card: "#FFFFFF",
    border: "#E8E8E8",
    muted: "#EEF0F3",
    mutedForeground: "#6B6B6B",
    destructive: "#DC2626",
  },
  dark: {
    background: "#0F1012",
    foreground: "#F2F2F2",
    card: "#1A1C1F",
    border: "#2A2D31",
    muted: "#25282C",
    mutedForeground: "#9A9DA3",
    destructive: "#EF4444",
  },
};

/** Used until the settings have loaded for the first time; matches the defaults in global.css. */
export const DEFAULT_THEME: AppTheme = {
  colors: { primary: "#0C831F", onPrimary: "#FFFFFF", accent: "#F8CB46", onAccent: "#1C1C1C" },
  radius: 12,
  cardStyle: "outlined",
  colorScheme: "light",
};

/** "#0C831F" → "12 131 31", the format the Tailwind colours expect. */
function channels(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

/** CSS variables that apply the admin-configured brand colours and corner radius. */
export function themeVariables(theme: AppTheme) {
  const radius = theme.radius;
  return {
    "--primary": channels(theme.colors.primary),
    "--primary-foreground": channels(theme.colors.onPrimary),
    "--highlight": channels(theme.colors.accent),
    "--highlight-foreground": channels(theme.colors.onAccent),
    "--radius": radius,
    "--radius-xl": radius + 4,
    "--radius-md": Math.max(radius - 2, 0),
    "--radius-sm": Math.max(radius - 4, 0),
  };
}

export function navigationTheme(scheme: Scheme, theme: AppTheme): Theme {
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const neutral = NEUTRAL[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      background: neutral.background,
      card: neutral.card,
      border: neutral.border,
      text: neutral.foreground,
      primary: theme.colors.primary,
      notification: neutral.destructive,
    },
  };
}
