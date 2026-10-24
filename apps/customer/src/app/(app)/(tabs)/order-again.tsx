import { router } from "expo-router";
import { RotateCcw } from "lucide-react-native";
import { FlatList, RefreshControl, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CartButton } from "@/components/cart-button";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { ProductCard } from "@/components/product-card";
import { QueryError } from "@/components/query-error";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAppTheme } from "@/lib/app-theme";
import { useBuyAgain } from "@/lib/orders";
import { useSettings } from "@/lib/settings";

const SIDE_PADDING = 16;
const GAP = 12;
const COLUMNS = 2;
/** The most the API returns. */
const LIMIT = 30;

function NothingYet() {
  return (
    <View className="items-center gap-3 px-8 py-12">
      <View className="size-16 items-center justify-center rounded-full bg-muted">
        <Icon as={RotateCcw} size={28} className="text-muted-foreground" />
      </View>
      <Text className="text-center text-lg font-extrabold">Nothing to order again yet</Text>
      <Text className="text-center text-sm text-muted-foreground">Things you order show up here, so you can add them again in one tap.</Text>
      <Button onPress={() => router.navigate("/")} className="mt-1 h-11 rounded-lg px-6">
        <Text className="font-semibold">Start shopping</Text>
      </Button>
    </View>
  );
}

/** What the customer has ordered before that is in stock, most often ordered first. */
export default function OrderAgainScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const { currency } = useSettings();
  const { width } = useWindowDimensions();
  const query = useBuyAgain({ limit: LIMIT });
  const itemWidth = (width - SIDE_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
        <Text className="text-2xl font-extrabold">Order again</Text>
        <CartButton />
      </View>
      <FlatList
        data={query.data?.items ?? []}
        keyExtractor={(product) => product.productId}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap: GAP, paddingHorizontal: SIDE_PADDING }}
        contentContainerStyle={{ gap: GAP, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <View style={{ width: itemWidth }}>
            <ProductCard product={item} currency={currency} />
          </View>
        )}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.primary} />}
        ListEmptyComponent={
          query.isPending ? (
            <View className="flex-row flex-wrap px-4" style={{ gap: GAP }}>
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="rounded-lg" style={{ width: itemWidth, height: itemWidth * 1.55 }} />
              ))}
            </View>
          ) : query.isError ? (
            <QueryError error={query.error} onRetry={() => query.refetch()} />
          ) : (
            <NothingYet />
          )
        }
      />
    </View>
  );
}
