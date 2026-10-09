import { ChevronRight } from "lucide-react-native";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CartBar } from "@/components/cart-bar";
import { CategoryGrid, CategoryGridSkeleton } from "@/components/category-grid";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAppTheme } from "@/lib/app-theme";
import { subCategories, topLevelCategories } from "@/lib/catalog";
import { openCategory } from "@/lib/navigation";
import { useCategories } from "@/lib/queries";
import type { Category } from "@/lib/types";

/** Each top-level category with its sub-categories; those without any are grouped at the end. */
function CategorySections({ categories }: { categories: Category[] }) {
  const tops = topLevelCategories(categories);
  const sections = tops.map((top) => ({ top, children: subCategories(categories, top.id) })).filter((section) => section.children.length > 0);
  const childless = tops.filter((top) => !sections.some((section) => section.top.id === top.id));

  if (sections.length === 0) return <CategoryGrid categories={tops} />;

  return (
    <View className="gap-7">
      {sections.map(({ top, children }) => (
        <View key={top.id} className="gap-3">
          <Pressable onPress={() => openCategory(top)} className="flex-row items-center justify-between px-4 active:opacity-70" accessibilityRole="button">
            <Text className="flex-1 text-lg font-extrabold" numberOfLines={1}>
              {top.name}
            </Text>
            <View className="flex-row items-center">
              <Text className="text-sm font-bold text-primary">See all</Text>
              <Icon as={ChevronRight} size={16} className="text-primary" />
            </View>
          </Pressable>
          <CategoryGrid categories={children} />
        </View>
      ))}
      {childless.length > 0 && (
        <View className="gap-3">
          <Text className="px-4 text-lg font-extrabold">More categories</Text>
          <CategoryGrid categories={childless} />
        </View>
      )}
    </View>
  );
}

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
          <CategorySections categories={categories.data.items} />
        )}
      </ScrollView>
      <CartBar inset={false} />
    </View>
  );
}
