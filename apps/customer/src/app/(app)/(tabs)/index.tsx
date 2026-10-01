import { useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { ChevronDown, LocateFixed, MapPinOff, Search, UserRound } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnnouncementBar } from "@/components/announcement-bar";
import { BrandMark } from "@/components/brand-mark";
import { CategoryGridSkeleton } from "@/components/category-grid";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { HomeSections } from "@/components/home/home-sections";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { useDeliveryLocation, useLocateMe } from "@/lib/delivery-location";
import { useHomeFeed } from "@/lib/queries";
import { cn } from "@/lib/utils";

const openLocationPicker = () => router.push("/location");

function HomeHeader() {
  const { location } = useDeliveryLocation();

  return (
    <View className="flex-row items-start justify-between gap-3 bg-highlight px-4 pb-3 pt-2">
      <Pressable onPress={openLocationPicker} className="flex-1 gap-0.5 active:opacity-80" accessibilityLabel="Change delivery location">
        <BrandMark textClassName="text-highlight-foreground text-sm" />
        <Text className="text-2xl font-extrabold text-highlight-foreground" numberOfLines={1}>
          {location ? location.label : "Deliver to"}
        </Text>
        <View className="flex-row items-center gap-1">
          <Text className="shrink text-sm font-semibold text-highlight-foreground" numberOfLines={1}>
            {location ? location.summary : "Set your delivery location"}
          </Text>
          <Icon as={ChevronDown} size={16} className="text-highlight-foreground" />
        </View>
      </Pressable>
      <Pressable
        onPress={() => router.navigate("/account")}
        className="size-10 items-center justify-center rounded-full bg-card active:opacity-80"
        accessibilityLabel="Account"
        hitSlop={6}
      >
        <Icon as={UserRound} size={20} />
      </Pressable>
    </View>
  );
}

function SearchBar() {
  return (
    <View className="bg-highlight px-4 pb-3">
      <View className="h-12 flex-row items-center gap-2.5 rounded-lg border border-border bg-card px-3.5">
        <Icon as={Search} size={18} className="text-muted-foreground" />
        <Text className="text-[15px] text-muted-foreground">Search for &quot;milk&quot;</Text>
      </View>
    </View>
  );
}

function HomeSkeleton() {
  return (
    <View className="gap-6">
      <View className="px-4">
        <Skeleton className="aspect-[2/1] w-full rounded-lg" />
      </View>
      <View className="gap-3">
        <Skeleton className="mx-4 h-5 w-40" />
        <CategoryGridSkeleton />
      </View>
    </View>
  );
}

function LocationPrompt() {
  const { colors } = useAppTheme();
  const surface = useCardSurface();
  const { locate, locating, error } = useLocateMe();

  return (
    <View className={cn("mx-4 gap-3 rounded-lg p-4", surface)}>
      <View className="gap-1">
        <Text className="text-base font-extrabold">Where should we deliver?</Text>
        <Text className="text-sm text-muted-foreground">Set your location to see prices and products from your nearest store.</Text>
      </View>
      <View className="flex-row gap-2">
        <Button onPress={locate} disabled={locating} className="h-11 flex-1 rounded-lg">
          {locating ? <ActivityIndicator color={colors.onPrimary} /> : <Icon as={LocateFixed} size={17} className="text-primary-foreground" />}
          <Text className="font-semibold">{locating ? "Locating…" : "Use my location"}</Text>
        </Button>
        <Button variant="outline" onPress={openLocationPicker} className="h-11 flex-1 rounded-lg">
          <Text className="font-semibold">Choose address</Text>
        </Button>
      </View>
      {error ? <Text className="text-xs text-destructive">{errorMessage(error)}</Text> : null}
    </View>
  );
}

function NotServiceable({ summary }: { summary: string }) {
  return (
    <View className="items-center gap-3 px-8 py-10">
      <View className="size-16 items-center justify-center rounded-full bg-muted">
        <Icon as={MapPinOff} size={28} className="text-muted-foreground" />
      </View>
      <Text className="text-center text-lg font-extrabold">We don&apos;t deliver here yet</Text>
      <Text className="text-center text-sm text-muted-foreground">
        There&apos;s no store near {summary}. Try another address.
      </Text>
      <Button onPress={openLocationPicker} className="mt-1 h-11 rounded-lg px-6">
        <Text className="font-semibold">Change location</Text>
      </Button>
    </View>
  );
}

function HomeContent() {
  const { location, ready, serviceability, store } = useDeliveryLocation();
  const checkingStore = location !== null && serviceability.isPending;
  const feed = useHomeFeed(store?.id, { enabled: ready && !checkingStore && (location === null || store !== null) });

  if (!ready || checkingStore) return <HomeSkeleton />;

  if (location && serviceability.isError) {
    return <QueryError error={serviceability.error} onRetry={() => serviceability.refetch()} />;
  }
  if (location && !store) return <NotServiceable summary={location.summary} />;

  return (
    <View className="gap-6">
      {!location && <LocationPrompt />}
      {feed.isPending ? (
        <HomeSkeleton />
      ) : feed.isError ? (
        <QueryError error={feed.error} onRetry={() => feed.refetch()} />
      ) : (
        <HomeSections sections={feed.data.sections} />
      )}
    </View>
  );
}

export default function HomeScreen() {
  const { colors, neutral } = useAppTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    await Promise.all(["addresses", "serviceability", "home"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    setRefreshing(false);
  }

  return (
    <View className="flex-1 bg-highlight" style={{ paddingTop: insets.top }}>
      <FocusStatusBar onHighlight />
      <ScrollView
        className="bg-background"
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-8"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.onAccent} />}
      >
        <HomeHeader />
        <SearchBar />
        <LinearGradient colors={[colors.accent, neutral.background]} style={{ height: 16 }} />
        <AnnouncementBar />
        <View className="pt-5">
          <HomeContent />
        </View>
      </ScrollView>
    </View>
  );
}
