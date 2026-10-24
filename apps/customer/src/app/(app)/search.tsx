import { router } from "expo-router";
import { ArrowLeft, History, Search, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CartButton } from "@/components/cart-button";
import { CategoryGrid, CategoryGridSkeleton } from "@/components/category-grid";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { ProductList } from "@/components/product-list";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useAppTheme } from "@/lib/app-theme";
import { topLevelCategories } from "@/lib/catalog";
import { useCategories, useProducts } from "@/lib/queries";
import { useRecentSearches } from "@/lib/recent-searches";
import { useRotatingSearchHint } from "@/lib/search-hints";

const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 300;

function RecentSearches({ searches, onSelect, onClear }: { searches: string[]; onSelect: (term: string) => void; onClear: () => void }) {
  return (
    <View className="gap-3 px-4 pb-5 pt-2">
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-extrabold">Recent searches</Text>
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Clear recent searches">
          <Text className="text-sm font-bold text-primary">Clear</Text>
        </Pressable>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {searches.map((term) => (
          <Pressable
            key={term}
            onPress={() => onSelect(term)}
            className="max-w-full flex-row items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 active:opacity-70"
            accessibilityLabel={`Search for ${term}`}
          >
            <Icon as={History} size={14} className="text-muted-foreground" />
            <Text className="shrink text-sm" numberOfLines={1}>
              {term}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { neutral } = useAppTheme();
  const categories = useCategories();
  const recent = useRecentSearches();
  const hint = useRotatingSearchHint();
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const lastFound = useRef<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const searching = term.length >= MIN_SEARCH_LENGTH;
  const results = useProducts({ search: term }, { enabled: searching });
  const found = searching && (results.data?.pages[0]?.items.length ?? 0) > 0;

  // The debounce also settles on half-typed words, so only the last term that found products is saved, once the screen closes.
  useEffect(() => {
    if (found) lastFound.current = term;
  }, [found, term]);

  const { add } = recent;
  useEffect(() => {
    return () => {
      if (lastFound.current) void add(lastFound.current);
    };
  }, [add]);

  function submit() {
    const trimmed = text.trim();
    setTerm(trimmed);
    if (trimmed.length >= MIN_SEARCH_LENGTH) void add(trimmed);
  }

  function selectRecent(saved: string) {
    setText(saved);
    setTerm(saved);
    void add(saved);
  }

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
            placeholder={`Search for "${hint}"`}
            placeholderTextColor={neutral.mutedForeground}
            returnKeyType="search"
            autoCorrect={false}
            onSubmitEditing={submit}
            className="h-full flex-1 text-[15px] text-foreground"
          />
          {text.length > 0 && (
            <Pressable onPress={() => setText("")} accessibilityLabel="Clear search" hitSlop={8}>
              <Icon as={X} size={18} className="text-muted-foreground" />
            </Pressable>
          )}
        </View>
        <CartButton />
      </View>

      {searching ? (
        <ProductList key={term} query={results} emptyText={`No results for "${term}". Try another word.`} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerClassName="pb-8">
          {recent.searches.length > 0 && <RecentSearches searches={recent.searches} onSelect={selectRecent} onClear={recent.clear} />}
          <Text className="px-4 pb-3 pt-2 text-lg font-extrabold">Browse categories</Text>
          {categories.data ? <CategoryGrid categories={topLevelCategories(categories.data.items)} /> : <CategoryGridSkeleton />}
        </ScrollView>
      )}
    </View>
  );
}
