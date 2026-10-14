import Constants from "expo-constants";
import { router } from "expo-router";
import {
  Bell,
  ChevronRight,
  FileText,
  Headset,
  Heart,
  Info,
  LogOut,
  Mail,
  MapPin,
  Package,
  Phone,
  Share2,
  Star,
  UserRound,
  type LucideIcon,
} from "lucide-react-native";
import { Alert, Linking, Pressable, ScrollView, Share, View, type AlertButton } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusStatusBar } from "@/components/focus-status-bar";
import { openPolicy } from "@/components/policy-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { useCardSurface } from "@/lib/app-theme";
import { formatPhone } from "@/lib/phone";
import { useNotificationsBlocked } from "@/lib/push";
import { useSession } from "@/lib/session";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

type RowProps = { icon: LucideIcon; label: string; detail?: string; onPress?: () => void };

function Row({ icon, label, detail, onPress }: RowProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="flex-row items-center gap-3 px-4 py-3.5 active:bg-accent">
      <View className="size-9 items-center justify-center rounded-md bg-muted">
        <Icon as={icon} size={18} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-semibold">{label}</Text>
        {detail ? <Text className="text-xs text-muted-foreground">{detail}</Text> : null}
      </View>
      {onPress ? <Icon as={ChevronRight} size={18} className="text-muted-foreground" /> : null}
    </Pressable>
  );
}

function Tile({ icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const surface = useCardSurface();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className={cn("flex-1 items-center gap-2 rounded-xl px-2 py-4 active:opacity-80", surface)}>
      <View className="size-11 items-center justify-center rounded-full bg-highlight">
        <Icon as={icon} size={21} className="text-highlight-foreground" />
      </View>
      <Text className="text-center text-[13px] font-semibold" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AccountScreen() {
  const { user, signOut } = useSession();
  const { appName, support, policies } = useSettings();
  const notifications = useNotificationsBlocked();
  const insets = useSafeAreaInsets();
  // The website's /app link sends Android phones to Google Play and iPhones to the App Store.
  const appLink = policies ? `${policies.home.replace(/\/+$/, "")}/app` : null;

  const helpOptions: AlertButton[] = [
    ...(support.phone ? [{ text: `Call ${formatPhone(support.phone)}`, onPress: () => void Linking.openURL(`tel:${support.phone}`) }] : []),
    ...(support.email ? [{ text: "Email us", onPress: () => void Linking.openURL(`mailto:${support.email}`) }] : []),
  ];
  const openHelp =
    helpOptions.length > 1
      ? () => Alert.alert("How can we help?", undefined, [...helpOptions, { text: "Cancel", style: "cancel" }])
      : helpOptions.length === 1
        ? () => helpOptions[0]!.onPress?.()
        : policies
          ? () => openPolicy(policies.contact)
          : null;

  function confirmSignOut() {
    Alert.alert("Log out?", "You will need your phone number and a new code to log in again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  function shareApp() {
    if (!appLink) return;
    Share.share({ message: `I shop on ${appName}. Get the app: ${appLink}` }).catch(() => {});
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-3">
        <Text className="text-2xl font-extrabold">Account</Text>

        <Pressable onPress={() => router.push("/profile")} accessibilityRole="button" accessibilityLabel="Edit profile">
          <Card className="flex-row items-center gap-4 px-4 py-4">
            <View className="size-14 items-center justify-center rounded-full bg-highlight">
              {user?.name ? (
                <Text className="text-xl font-extrabold text-highlight-foreground">{user.name.charAt(0).toUpperCase()}</Text>
              ) : (
                <Icon as={UserRound} size={26} className="text-highlight-foreground" />
              )}
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-lg font-bold" numberOfLines={1}>
                {user?.name ?? "Add your name"}
              </Text>
              {user ? <Text className="text-sm text-muted-foreground">{formatPhone(user.phone)}</Text> : null}
              {user?.email ? (
                <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                  {user.email}
                </Text>
              ) : null}
            </View>
            <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
          </Card>
        </Pressable>

        <View className="flex-row gap-3">
          <Tile icon={Package} label="Your orders" onPress={() => router.push("/orders")} />
          <Tile icon={Heart} label="Wishlist" onPress={() => router.push("/wishlist")} />
          {openHelp ? <Tile icon={Headset} label="Help" onPress={openHelp} /> : null}
        </View>

        <Card className="gap-0 overflow-hidden py-1">
          <Row icon={MapPin} label="Saved addresses" onPress={() => router.push("/addresses")} />
          <Separator className="ml-16 w-auto" />
          <Row
            icon={Bell}
            label="Order updates"
            detail={notifications.blocked ? "Off. Tap to get notified about your orders" : "On"}
            onPress={notifications.blocked ? () => void notifications.enable() : () => void Linking.openSettings()}
          />
        </Card>

        {support.phone || support.email ? (
          <View className="gap-2">
            <Text className="px-1 text-sm font-semibold text-muted-foreground">Help and support</Text>
            <Card className="gap-0 overflow-hidden py-1">
              {support.phone ? <Row icon={Phone} label="Call us" detail={formatPhone(support.phone)} onPress={() => Linking.openURL(`tel:${support.phone}`)} /> : null}
              {support.phone && support.email ? <Separator className="ml-16 w-auto" /> : null}
              {support.email ? <Row icon={Mail} label="Email us" detail={support.email} onPress={() => Linking.openURL(`mailto:${support.email}`)} /> : null}
            </Card>
          </View>
        ) : null}

        {policies && appLink ? (
          <View className="gap-2">
            <Text className="px-1 text-sm font-semibold text-muted-foreground">More</Text>
            <Card className="gap-0 overflow-hidden py-1">
              <Row icon={Share2} label={`Share ${appName}`} detail="Invite friends and family" onPress={shareApp} />
              <Separator className="ml-16 w-auto" />
              <Row icon={Star} label="Rate us" detail="Tell others what you think" onPress={() => void Linking.openURL(appLink)} />
              <Separator className="ml-16 w-auto" />
              <Row icon={Info} label={`About ${appName}`} onPress={() => openPolicy(policies.home)} />
              <Separator className="ml-16 w-auto" />
              <Row icon={FileText} label="Terms and policies" detail="Privacy, refunds and delivery" onPress={() => openPolicy(policies.index)} />
            </Card>
          </View>
        ) : null}

        <Button variant="outline" onPress={confirmSignOut} className="mt-2 h-12 rounded-lg">
          <Icon as={LogOut} size={18} className="text-destructive" />
          <Text className="font-semibold text-destructive">Log out</Text>
        </Button>

        <Text className="text-center text-xs text-muted-foreground">
          {appName} · version {Constants.expoConfig?.version ?? "1.0.0"}
        </Text>
      </ScrollView>
    </View>
  );
}
