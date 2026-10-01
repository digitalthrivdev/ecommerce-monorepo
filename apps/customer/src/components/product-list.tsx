import type { ReactElement } from "react";
import { ActivityIndicator, FlatList, useWindowDimensions, View } from "react-native";

import { ProductCard } from "@/components/product-card";
import { QueryError } from "@/components/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAppTheme } from "@/lib/app-theme";
import type { useStoreProducts } from "@/lib/queries";
import { useSettings } from "@/lib/settings";

const SIDE_PADDING = 16;
const GAP = 12;
const COLUMNS = 2;

type ProductListProps = { query: ReturnType<typeof useStoreProducts>; emptyText: string; header?: ReactElement };

/** Two-column product grid that loads the next page as the user nears the end. */
export function ProductList({ query, emptyText, header }: ProductListProps) {
  const { currency } = useSettings();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const itemWidth = (width - SIDE_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  const products = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <FlatList
      data={products}
      keyExtractor={(product) => product.storeProductId}
      numColumns={COLUMNS}
      columnWrapperStyle={{ gap: GAP, paddingHorizontal: SIDE_PADDING }}
      contentContainerStyle={{ gap: GAP, paddingTop: 4, paddingBottom: 32 }}
      renderItem={({ item }) => (
        <View style={{ width: itemWidth }}>
          <ProductCard product={item} currency={currency} />
        </View>
      )}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
      }}
      onEndReachedThreshold={0.6}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={header}
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
          <Text className="px-8 py-12 text-center text-sm text-muted-foreground">{emptyText}</Text>
        )
      }
      ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={colors.primary} className="py-4" /> : null}
    />
  );
}
