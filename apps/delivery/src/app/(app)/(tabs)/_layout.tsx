import { Tabs } from "expo-router";
import { Bike, History, UserRound } from "lucide-react-native";

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
      <Tabs.Screen name="index" options={{ title: "Deliveries", tabBarIcon: ({ color, size }) => <Bike color={color} size={size - 2} /> }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: ({ color, size }) => <History color={color} size={size - 2} /> }} />
      <Tabs.Screen name="account" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <UserRound color={color} size={size - 2} /> }} />
    </Tabs>
  );
}
