import { Tabs } from "expo-router";
import { House, LayoutGrid, UserRound } from "lucide-react-native";

import { useAppTheme } from "@/lib/app-theme";

export default function TabsLayout() {
  const { colors, neutral } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: neutral.mutedForeground,
        tabBarStyle: { backgroundColor: neutral.card, borderTopColor: neutral.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <House color={color} size={size - 2} /> }} />
      <Tabs.Screen name="categories" options={{ title: "Categories", tabBarIcon: ({ color, size }) => <LayoutGrid color={color} size={size - 2} /> }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: ({ color, size }) => <UserRound color={color} size={size - 2} /> }} />
    </Tabs>
  );
}
