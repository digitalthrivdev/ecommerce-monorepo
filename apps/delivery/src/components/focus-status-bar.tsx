import { useIsFocused } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";

import { useAppTheme } from "@/lib/app-theme";

function isDarkColor(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/**
 * Status bar for the focused screen only, so tabs that stay mounted do not fight over it.
 * `onHighlight` screens draw their header in the admin's highlight colour.
 */
export function FocusStatusBar({ onHighlight = false }: { onHighlight?: boolean }) {
  const focused = useIsFocused();
  const { scheme, colors } = useAppTheme();
  if (!focused) return null;
  const darkContent = onHighlight ? isDarkColor(colors.onAccent) : scheme === "light";
  return <StatusBar style={darkContent ? "dark" : "light"} />;
}
