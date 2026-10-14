import type { ReactElement } from "react";
import { ActivityIndicator, FlatList, useWindowDimensions, View } from "react-native";

import { ProductCard } from "@/components/product-card";
import { QueryError } from "@/components/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useAppTheme } from "@/lib/app-theme";
import type { useProducts } from "@/lib/queries";
import { useSettings } from "@/lib/settings";

const GAP = 12;
const COLUMNS = 2;

type ProductListProps = {
  query: ReturnType<typeof useProducts>;
  emptyText: string;
  header?: ReactElement;
  /** Screen width minus whatever sits beside the grid, e.g. a sidebar. */
  width?: number;
  sidePadding?: number;
};

/** Two-column product grid that loads the next page as the user nears the end. */
export function ProductList({ query, emptyText, header, width, sidePadding = 16 }: ProductListProps) {
  const { currency } = useSettings();
  const { colors } = useAppTheme();
  const screen = useWindowDimensions();
  const itemWidth = ((width ?? screen.width) - sidePadding * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  const products = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <FlatList
      data={products}
      keyExtractor={(product) => product.productId}
      numColumns={COLUMNS}
      columnWrapperStyle={{ gap: GAP, paddingHorizontal: sidePadding }}
      contentContainerStyle={{ gap: GAP * 1.5, paddingTop: 12, paddingBottom: 32 }}
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
          <View className="flex-row flex-wrap" style={{ gap: GAP, paddingHorizontal: sidePadding }}>
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
