import { ThemeProvider } from "expo-router/react-navigation";
import { useColorScheme, vars } from "nativewind";
import { createContext, use, useEffect, useMemo, type PropsWithChildren } from "react";
import { View } from "react-native";

import { navigationTheme, NEUTRAL, themeVariables, type Scheme } from "./theme";
import type { AppTheme } from "./types";

type AppThemeValue = AppTheme & { scheme: Scheme; neutral: (typeof NEUTRAL)[Scheme] };

const AppThemeContext = createContext<AppThemeValue | null>(null);

export function useAppTheme() {
  const value = use(AppThemeContext);
  if (!value) throw new Error("useAppTheme must be used inside <AppThemeProvider>");
  return value;
}

const CARD_SURFACES = {
  outlined: "bg-card border border-border",
  elevated: "bg-card shadow-md shadow-black/10",
  flat: "bg-card",
} as const;

/** Background, border and shadow classes for card-like surfaces, following the admin's card style. */
export function useCardSurface() {
  return CARD_SURFACES[useAppTheme().cardStyle];
}

/** Applies the admin-configured theme: brand colours and radius as CSS variables, and the light/dark preference. */
export function AppThemeProvider({ theme, children }: PropsWithChildren<{ theme: AppTheme }>) {
  const { colorScheme, setColorScheme } = useColorScheme();

  useEffect(() => {
    setColorScheme(theme.colorScheme);
  }, [setColorScheme, theme.colorScheme]);

  const scheme: Scheme = colorScheme === "dark" ? "dark" : "light";
  const style = useMemo(() => vars(themeVariables(theme)), [theme]);
  const value = useMemo(() => ({ ...theme, scheme, neutral: NEUTRAL[scheme] }), [theme, scheme]);
  const navTheme = useMemo(() => navigationTheme(scheme, theme), [scheme, theme]);

  return (
    <AppThemeContext value={value}>
      <ThemeProvider value={navTheme}>
        <View style={style} className="flex-1 bg-background">
          {children}
        </View>
      </ThemeProvider>
    </AppThemeContext>
  );
}
