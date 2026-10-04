import { useIsFocused } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";

import { useAppTheme } from "@/lib/app-theme";

function isDarkColor(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

type FocusStatusBarProps = {
  onHighlight?: boolean;
  onPrimary?: boolean;
  /** The colour of the header's own text, for headers with colours of their own, e.g. a category tab's page. */
  contentColor?: string;
};

/**
 * Status bar for the focused screen only, so tabs that stay mounted do not fight over it.
 * `onHighlight` and `onPrimary` screens draw their header in the admin's highlight or primary colour.
 */
export function FocusStatusBar({ onHighlight = false, onPrimary = false, contentColor }: FocusStatusBarProps) {
  const focused = useIsFocused();
  const { scheme, colors } = useAppTheme();
  if (!focused) return null;
  const darkContent = contentColor
    ? isDarkColor(contentColor)
    : onPrimary
      ? isDarkColor(colors.onPrimary)
      : onHighlight
        ? isDarkColor(colors.onAccent)
        : scheme === "light";
  return <StatusBar style={darkContent ? "dark" : "light"} animated />;
}
