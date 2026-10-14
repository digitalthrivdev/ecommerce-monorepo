import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { Search, UserRound } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Pressable, RefreshControl, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActiveOrderBar } from "@/components/active-order-bar";
import { AnnouncementBar } from "@/components/announcement-bar";
import { CartBar } from "@/components/cart-bar";
import { BrandMark } from "@/components/brand-mark";
import { CategoryGridSkeleton } from "@/components/category-grid";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { CategoryTabs, opensPage } from "@/components/home/category-tabs";
import { HeaderFade, HeaderLookProvider, HeaderRegion } from "@/components/home/header-backdrop";
import { HomeSections } from "@/components/home/home-sections";
import { QueryError } from "@/components/query-error";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAppTheme } from "@/lib/app-theme";
import { useHomeFeed, useHomeTabPage } from "@/lib/queries";
import { useRotatingSearchHint } from "@/lib/search-hints";
import { useSettings } from "@/lib/settings";
import type { CategoryTab, TabHeader } from "@/lib/types";
import { cn } from "@/lib/utils";

function HomeHeader() {
  const { deliveryPromiseMinutes } = useSettings();

  return (
    <View className="flex-row items-center justify-between gap-3 px-4 pb-3 pt-2">
      <View className="flex-1 gap-0.5">
        <BrandMark textClassName="text-highlight-foreground text-2xl" />
        {deliveryPromiseMinutes ? (
          <Text className="text-sm font-semibold text-highlight-foreground" numberOfLines={1}>
            Delivery in about {deliveryPromiseMinutes} minutes
          </Text>
        ) : null}
      </View>
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

/** Sticks to the top with the category tabs under it. */
function SearchBar({ tabs, selectedId, onSelect }: { tabs: CategoryTab[]; selectedId: string | null; onSelect: (tab: CategoryTab | null) => void }) {
  return (
    <View className={cn(tabs.length === 0 && "pb-3")}>
      <View className="px-4">
        <SearchField />
      </View>
      <CategoryTabs tabs={tabs} selectedId={selectedId} onSelect={onSelect} />
    </View>
  );
}

function SearchField() {
  const hint = useRotatingSearchHint();

  return (
    <Pressable
      onPress={() => router.push("/search")}
      className="h-12 flex-row items-center gap-2.5 overflow-hidden rounded-lg border border-border bg-card px-3.5 active:opacity-80"
      accessibilityRole="search"
      accessibilityLabel="Search products"
    >
      <Icon as={Search} size={18} className="text-muted-foreground" />
      <Text className="text-[15px] text-muted-foreground">Search for</Text>
      <Animated.View key={hint} entering={FadeInDown.duration(250)} style={{ flexShrink: 1 }}>
        <Text className="text-[15px] text-muted-foreground" numberOfLines={1}>
          &quot;{hint}&quot;
        </Text>
      </Animated.View>
    </Pressable>
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

/** The "All" home sections, or the sections of the tab whose page is open. */
function HomeContent({ tab }: { tab: CategoryTab | null }) {
  const home = useHomeFeed();
  const tabPage = useHomeTabPage(tab?.id ?? null);
  const feed = tab ? tabPage : home;

  if (feed.isPending) return <HomeSkeleton />;
  if (feed.isError) return <QueryError error={feed.error} onRetry={() => feed.refetch()} />;
  return <HomeSections sections={feed.data.sections} />;
}

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { announcement } = useSettings();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [searchHeight, setSearchHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);

  const feed = useHomeFeed({ enabled: false });
  const tabs = useMemo(() => feed.data?.categoryTabs ?? [], [feed.data]);
  const selectedTab = tabs.find((tab) => tab.id === selectedId && opensPage(tab)) ?? null;
  const look: TabHeader = selectedTab?.header ?? { color: colors.accent, gradientColor: null, textColor: colors.onAccent, imageUrl: null };

  const tabPage = useHomeTabPage(selectedTab?.id ?? null, { enabled: false });
  const sections = selectedTab ? tabPage.data?.sections : feed.data?.sections;
  const showAnnouncement = !selectedTab && announcement.enabled && Boolean(announcement.text);
  // A band on the first section continues straight from the header, unless a notice sits between them.
  const topBand = !showAnnouncement ? (sections?.[0]?.background ?? null) : null;

  useEffect(() => {
    const urls = tabs.flatMap((tab) => (opensPage(tab) && tab.header?.imageUrl ? [tab.header.imageUrl] : []));
    if (urls.length > 0) void Image.prefetch(urls);
  }, [tabs]);

  const selectTab = useCallback(
    (tab: CategoryTab | null) => {
      setSelectedId(tab?.id ?? null);
      // The new page starts under the stuck search bar instead of wherever the old one was scrolled to.
      if (scrollY.current > headerHeight) scrollRef.current?.scrollTo({ y: headerHeight, animated: false });
    },
    [headerHeight],
  );

  useFocusEffect(
    useCallback(() => {
      if (!selectedTab) return;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        selectTab(null);
        return true;
      });
      return () => subscription.remove();
    }, [selectedTab, selectTab]),
  );

  async function refresh() {
    setRefreshing(true);
    await Promise.all(["settings", "home"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    setRefreshing(false);
  }

  return (
    <HeaderLookProvider look={look} height={insets.top + headerHeight + searchHeight} imageTop={insets.top}>
      <View className="flex-1 bg-background">
        <FocusStatusBar contentColor={look.textColor} />
        <HeaderRegion offset={0} style={{ height: insets.top }} />
        <ScrollView
          ref={scrollRef}
          stickyHeaderIndices={[1]}
          showsVerticalScrollIndicator={false}
          contentContainerClassName="pb-8"
          onScroll={(event) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={32}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={look.textColor} />}
        >
          <HeaderRegion offset={insets.top} onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
            <HomeHeader />
          </HeaderRegion>
          <HeaderRegion offset={insets.top + headerHeight} onLayout={(event) => setSearchHeight(event.nativeEvent.layout.height)}>
            <SearchBar tabs={tabs} selectedId={selectedTab?.id ?? null} onSelect={selectTab} />
          </HeaderRegion>
          {showAnnouncement ? <AnnouncementBar /> : <HeaderFade to={topBand?.color} />}
          <View className={cn(!topBand && "pt-5")}>
            <HomeContent tab={selectedTab} />
          </View>
        </ScrollView>
        <ActiveOrderBar />
        <CartBar inset={false} />
      </View>
    </HeaderLookProvider>
  );
}
