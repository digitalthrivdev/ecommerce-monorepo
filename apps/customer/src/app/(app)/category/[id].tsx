import { router, useLocalSearchParams } from "expo-router";
import { Search } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CartBar } from "@/components/cart-bar";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { ProductList } from "@/components/product-list";
import { ScreenHeader } from "@/components/screen-header";
import { StoreRequired } from "@/components/store-required";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useDeliveryLocation } from "@/lib/delivery-location";
import { useCategories, useStoreProducts } from "@/lib/queries";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

function CategoryChips({ categories, selectedId }: { categories: Category[]; selectedId: string }) {
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef(new Map<string, number>());

  useEffect(() => {
    const x = offsets.current.get(selectedId);
    if (x !== undefined) scrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [selectedId]);

  return (
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 pb-3" className="grow-0">
      {categories.map((category) => {
        const selected = category.id === selectedId;
        return (
          <Pressable
            key={category.id}
            onLayout={(event) => {
              offsets.current.set(category.id, event.nativeEvent.layout.x);
              if (selected) scrollRef.current?.scrollTo({ x: Math.max(0, event.nativeEvent.layout.x - 16), animated: false });
            }}
            onPress={() => router.setParams({ id: category.id, name: category.name })}
            className={cn("rounded-full border px-4 py-2", selected ? "border-primary bg-primary" : "border-border bg-card active:bg-accent")}
          >
            <Text className={cn("text-sm font-semibold", selected && "text-primary-foreground")}>{category.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function CategoryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const { store } = useDeliveryLocation();
  const categories = useCategories();
  const products = useStoreProducts(store?.id, { categoryId: id });
  const title = categories.data?.items.find((category) => category.id === id)?.name ?? name ?? "Products";

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader
        title={title}
        right={
          <Pressable onPress={() => router.push("/search")} className="size-11 items-center justify-center rounded-full active:bg-accent" accessibilityLabel="Search" hitSlop={8}>
            <Icon as={Search} size={21} />
          </Pressable>
        }
      />
      {categories.data && categories.data.items.length > 1 && <CategoryChips categories={categories.data.items} selectedId={id} />}
      {store ? <ProductList key={id} query={products} emptyText="No products in this category yet." /> : <StoreRequired />}
      <CartBar />
    </View>
  );
}
