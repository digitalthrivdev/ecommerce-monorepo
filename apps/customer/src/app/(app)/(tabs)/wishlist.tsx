import { Image } from "expo-image";
import { router } from "expo-router";
import { Heart } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CartButton } from "@/components/cart-button";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { ProductCard } from "@/components/product-card";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { WishlistButton } from "@/components/wishlist-button";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { smallImage } from "@/lib/images";
import { openProduct } from "@/lib/navigation";
import { useSession } from "@/lib/session";
import { useSettings } from "@/lib/settings";
import type { WishlistItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWishlist } from "@/lib/wishlist";

const GAP = 12;
const COLUMNS = 2;
const SIDE_PADDING = 16;

/** A saved product that is no longer on sale. */
function UnavailableCard({ item }: { item: WishlistItem }) {
  const surface = useCardSurface();
  const [failed, setFailed] = useState(false);

  return (
    <Pressable onPress={() => openProduct(item.productId)} className={cn("rounded-xl p-1.5 pb-2 active:opacity-80", surface)}>
      <View className="aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-white">
        <View className="size-full items-center justify-center opacity-40">
          {item.imageUrl && !failed ? (
            <Image source={{ uri: smallImage(item.imageUrl) }} style={{ width: "88%", height: "88%" }} contentFit="contain" onError={() => setFailed(true)} />
          ) : (
            <Text className="text-3xl font-extrabold text-primary">{item.name.charAt(0)}</Text>
          )}
        </View>
        <WishlistButton productId={item.productId} size={16} onImage className="absolute right-1 top-1 size-7 bg-white/90" />
      </View>
      <View className="mt-2 gap-0.5 px-0.5">
        <Text className="text-[11px] font-semibold text-muted-foreground">Not available right now</Text>
        <Text className="text-[13px] font-semibold leading-tight" numberOfLines={3}>
          {item.name}
        </Text>
      </View>
    </Pressable>
  );
}

export default function WishlistTabScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { user } = useSession();
  const { currency } = useSettings();
  const screen = useWindowDimensions();
  const wishlist = useWishlist();
  const [refreshing, setRefreshing] = useState(false);
  const items = wishlist.data?.pages.flatMap((page) => page.items) ?? [];
  const itemWidth = (screen.width - SIDE_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  async function refresh() {
    setRefreshing(true);
    await wishlist.refetch();
    setRefreshing(false);
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
        <Text className="text-2xl font-extrabold">Wishlist</Text>
        <CartButton />
      </View>
      {!user ? (
        <View className="mx-4 mb-2 flex-row items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3">
          <View className="flex-1 pr-3">
            <Text className="text-xs font-bold text-foreground">Sign in to sync your wishlist</Text>
            <Text className="text-[11px] text-muted-foreground">Keep your saved items across all devices</Text>
          </View>
          <Button size="sm" onPress={() => router.push("/sign-in")} className="h-8 rounded-lg px-3">
            <Text className="text-xs font-bold">Sign in</Text>
          </Button>
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(item) => item.productId}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP, paddingHorizontal: SIDE_PADDING }}
        contentContainerStyle={{ gap: GAP * 1.5, paddingTop: 8, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        renderItem={({ item }) => (
          <View style={{ width: itemWidth }}>
            {item.product ? <ProductCard product={item.product} currency={currency} /> : <UnavailableCard item={item} />}
          </View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        onEndReached={() => {
          if (wishlist.hasNextPage && !wishlist.isFetchingNextPage) wishlist.fetchNextPage();
        }}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          wishlist.isPending ? (
            <View className="flex-row flex-wrap" style={{ gap: GAP, paddingHorizontal: SIDE_PADDING }}>
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="rounded-lg" style={{ width: itemWidth, height: itemWidth * 1.55 }} />
              ))}
            </View>
          ) : wishlist.isError ? (
            <QueryError error={wishlist.error} onRetry={() => wishlist.refetch()} />
          ) : (
            <View className="flex-1 items-center justify-center gap-3 px-8 pb-16">
              <View className="size-20 items-center justify-center rounded-full bg-muted">
                <Icon as={Heart} size={34} className="text-muted-foreground" />
              </View>
              <Text className="text-center text-lg font-extrabold">Your wishlist is empty</Text>
              <Text className="text-center text-sm text-muted-foreground">Tap the heart on a product to save it for later.</Text>
              <Button onPress={() => router.navigate("/")} className="mt-1 h-11 rounded-lg px-6">
                <Text className="font-semibold">Start shopping</Text>
              </Button>
            </View>
          )
        }
        ListFooterComponent={wishlist.isFetchingNextPage ? <ActivityIndicator color={colors.primary} className="py-4" /> : null}
      />
    </View>
  );
}
