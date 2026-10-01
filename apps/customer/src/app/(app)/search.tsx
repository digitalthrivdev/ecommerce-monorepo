import { router } from "expo-router";
import { ArrowLeft, Search, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CategoryGrid, CategoryGridSkeleton } from "@/components/category-grid";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { ProductList } from "@/components/product-list";
import { StoreRequired } from "@/components/store-required";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAppTheme } from "@/lib/app-theme";
import { useDeliveryLocation } from "@/lib/delivery-location";
import { useCategories, useStoreProducts } from "@/lib/queries";

const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 300;

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { neutral } = useAppTheme();
  const { store } = useDeliveryLocation();
  const categories = useCategories();
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const searching = term.length >= MIN_SEARCH_LENGTH;
  const results = useStoreProducts(store?.id, { search: term }, { enabled: searching });

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <View className="flex-row items-center gap-1 px-2 pb-3 pt-2">
        <Pressable onPress={() => router.back()} className="size-11 items-center justify-center rounded-full active:bg-accent" accessibilityLabel="Back" hitSlop={8}>
          <Icon as={ArrowLeft} size={22} />
        </Pressable>
        <View className="h-12 flex-1 flex-row items-center gap-2 rounded-lg border border-border bg-card px-3">
          <Icon as={Search} size={18} className="text-muted-foreground" />
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            placeholder='Search for "milk"'
            placeholderTextColor={neutral.mutedForeground}
            returnKeyType="search"
            autoCorrect={false}
            onSubmitEditing={() => setTerm(text.trim())}
            className="h-full flex-1 text-[15px] text-foreground"
          />
          {text.length > 0 && (
            <Pressable onPress={() => setText("")} accessibilityLabel="Clear search" hitSlop={8}>
              <Icon as={X} size={18} className="text-muted-foreground" />
            </Pressable>
          )}
        </View>
      </View>

      {!store ? (
        <StoreRequired />
      ) : searching ? (
        <ProductList key={term} query={results} emptyText={`No results for "${term}". Try another word.`} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="pb-8">
          <Text className="px-4 pb-3 pt-2 text-lg font-extrabold">Browse categories</Text>
          {categories.data ? <CategoryGrid categories={categories.data.items} /> : <CategoryGridSkeleton />}
        </ScrollView>
      )}
    </View>
  );
}
