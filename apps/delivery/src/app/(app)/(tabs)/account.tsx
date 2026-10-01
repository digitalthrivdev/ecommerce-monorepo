import Constants from "expo-constants";
import { Bike, LogOut, Mail, Phone, UserRound, type LucideIcon } from "lucide-react-native";
import { Alert, Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusStatusBar } from "@/components/focus-status-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { usePartner, useSetPartnerStatus } from "@/lib/delivery";
import { formatPhone } from "@/lib/phone";
import { useSession } from "@/lib/session";
import { useSettings } from "@/lib/settings";

function Row({ icon, label, detail, onPress }: { icon: LucideIcon; label: string; detail?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="flex-row items-center gap-3 px-4 py-3.5 active:bg-accent">
      <View className="size-9 items-center justify-center rounded-md bg-muted">
        <Icon as={icon} size={18} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold">{label}</Text>
        {detail ? <Text className="text-xs text-muted-foreground">{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useSession();
  const { appName, support } = useSettings();
  const partner = usePartner().data;
  const setStatus = useSetPartnerStatus();
  const vehicle = [partner?.vehicleType, partner?.vehicleNumber].filter(Boolean).join(" · ");

  function confirmSignOut() {
    if (partner?.status === "BUSY") {
      Alert.alert("Finish your delivery first", "You can log out once your active delivery is complete.");
      return;
    }
    Alert.alert("Log out?", "You will go offline and stop receiving orders.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            if (partner?.status === "ONLINE") await setStatus.mutateAsync("OFFLINE");
            await signOut();
          } catch (error) {
            Alert.alert("Couldn't log out", errorMessage(error));
          }
        },
      },
    ]);
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-3">
        <Text className="text-2xl font-extrabold">Profile</Text>

        <Card className="flex-row items-center gap-4 px-4 py-4">
          <View className="size-14 items-center justify-center rounded-full bg-highlight">
            {partner?.name ? (
              <Text className="text-xl font-extrabold text-highlight-foreground">{partner.name.charAt(0).toUpperCase()}</Text>
            ) : (
              <Icon as={UserRound} size={26} className="text-highlight-foreground" />
            )}
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-lg font-bold" numberOfLines={1}>
              {partner?.name ?? user?.name ?? "Delivery partner"}
            </Text>
            {user ? <Text className="text-sm text-muted-foreground">{formatPhone(user.phone)}</Text> : null}
          </View>
        </Card>

        <Card className="gap-0 overflow-hidden py-1">
          <Row icon={Bike} label="Vehicle" detail={vehicle || "Not set. Ask your store admin to add it."} />
        </Card>

        {support.phone || support.email ? (
          <View className="gap-2">
            <Text className="px-1 text-sm font-semibold text-muted-foreground">Help and support</Text>
            <Card className="gap-0 overflow-hidden py-1">
              {support.phone ? <Row icon={Phone} label="Call support" detail={formatPhone(support.phone)} onPress={() => Linking.openURL(`tel:${support.phone}`)} /> : null}
              {support.phone && support.email ? <Separator className="ml-16 w-auto" /> : null}
              {support.email ? <Row icon={Mail} label="Email support" detail={support.email} onPress={() => Linking.openURL(`mailto:${support.email}`)} /> : null}
            </Card>
          </View>
        ) : null}

        <Button variant="outline" onPress={confirmSignOut} disabled={setStatus.isPending} className="mt-2 h-12 rounded-lg">
          <Icon as={LogOut} size={18} className="text-destructive" />
          <Text className="font-semibold text-destructive">Log out</Text>
        </Button>

        <Text className="text-center text-xs text-muted-foreground">
          {appName} Delivery · version {Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
      </ScrollView>
    </View>
  );
}
