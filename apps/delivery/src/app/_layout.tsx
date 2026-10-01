import "../../global.css";

import { PortalHost } from "@rn-primitives/portal";
import { QueryClientProvider } from "@tanstack/react-query";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { WifiOff } from "lucide-react-native";
import { useEffect } from "react";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { AppThemeProvider, useAppTheme } from "@/lib/app-theme";
import { queryClient } from "@/lib/query-client";
import { SessionProvider, useSession } from "@/lib/session";
import { SettingsProvider, useSettingsState } from "@/lib/settings";
import { DEFAULT_THEME } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <SessionProvider>
          <Root />
        </SessionProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}

function Root() {
  const { settings, ready, error, retry } = useSettingsState();
  const { isLoading } = useSession();
  const loading = !ready || isLoading;

  useEffect(() => {
    if (!loading) SplashScreen.hide();
  }, [loading]);

  if (loading) return null;

  return (
    <AppThemeProvider theme={settings?.theme ?? DEFAULT_THEME}>
      {settings ? <RootNavigator /> : <StartupError message={errorMessage(error)} onRetry={retry} />}
      <PortalHost />
    </AppThemeProvider>
  );
}

function RootNavigator() {
  const { token } = useSession();
  const { scheme } = useAppTheme();

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={Boolean(token)}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={!token}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="verify" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** First launch without a connection: there are no cached settings to start from. */
function StartupError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { scheme } = useAppTheme();
  return (
    <View className="flex-1 items-center justify-center gap-4 px-8">
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View className="size-16 items-center justify-center rounded-full bg-muted">
        <Icon as={WifiOff} size={28} className="text-muted-foreground" />
      </View>
      <Text className="text-center text-xl font-bold">Can&apos;t connect right now</Text>
      <Text className="text-center text-muted-foreground">{message}</Text>
      <Button onPress={onRetry} className="mt-2 h-12 rounded-lg px-8">
        <Text className="font-semibold">Try again</Text>
      </Button>
    </View>
  );
}
