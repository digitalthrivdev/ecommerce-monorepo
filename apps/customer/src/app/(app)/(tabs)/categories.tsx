import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CategoryGrid, CategoryGridSkeleton } from "@/components/category-grid";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { Text } from "@/components/ui/text";
import { useAppTheme } from "@/lib/app-theme";
import { useCategories } from "@/lib/queries";

export default function CategoriesScreen() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const categories = useCategories();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScrollView
        contentContainerClassName="pb-8"
        refreshControl={<RefreshControl refreshing={categories.isRefetching} onRefresh={() => categories.refetch()} tintColor={colors.primary} />}
      >
        <Text className="px-4 pb-4 pt-3 text-2xl font-extrabold">All categories</Text>
        {categories.isPending ? (
          <CategoryGridSkeleton />
        ) : categories.isError ? (
          <QueryError error={categories.error} onRetry={() => categories.refetch()} />
        ) : (
          <CategoryGrid categories={categories.data.items} />
        )}
      </ScrollView>
    </View>
  );
}
