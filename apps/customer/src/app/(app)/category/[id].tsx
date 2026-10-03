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
import { subCategories, topLevelCategories } from "@/lib/catalog";
import { useDeliveryLocation } from "@/lib/delivery-location";
import { useCategories, useStoreProducts } from "@/lib/queries";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

type Chip = { id: string; name: string };

function CategoryChips({ chips, selectedId, small = false }: { chips: Chip[]; selectedId: string; small?: boolean }) {
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef(new Map<string, number>());

  useEffect(() => {
    const x = offsets.current.get(selectedId);
    if (x !== undefined) scrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [selectedId]);

  return (
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 pb-3" className="grow-0">
      {chips.map((chip) => {
        const selected = chip.id === selectedId;
        return (
          <Pressable
            key={chip.id}
            onLayout={(event) => {
              offsets.current.set(chip.id, event.nativeEvent.layout.x);
              if (selected) scrollRef.current?.scrollTo({ x: Math.max(0, event.nativeEvent.layout.x - 16), animated: false });
            }}
            onPress={() => router.setParams({ id: chip.id, name: chip.name })}
            className={cn(
              "rounded-full border",
              small ? "px-3 py-1.5" : "px-4 py-2",
              selected ? (small ? "border-primary bg-primary/10" : "border-primary bg-primary") : "border-border bg-card active:bg-accent",
            )}
          >
            <Text className={cn("font-semibold", small ? "text-xs" : "text-sm", selected && (small ? "text-primary" : "text-primary-foreground"))}>{chip.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The top-level category and its sub-categories around the one being viewed. */
function categoryContext(categories: Category[], id: string) {
  const current = categories.find((category) => category.id === id);
  const top = current?.parentId ? categories.find((category) => category.id === current.parentId) : current;
  return { current, top, children: top ? subCategories(categories, top.id) : [] };
}

export default function CategoryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const { store } = useDeliveryLocation();
  const categories = useCategories();
  const products = useStoreProducts(store?.id, { categoryId: id });
  const all = categories.data?.items ?? [];
  const tops = topLevelCategories(all);
  const { current, top, children } = categoryContext(all, id);
  const title = top?.name ?? current?.name ?? name ?? "Products";

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
      {tops.length > 1 && top && <CategoryChips chips={tops} selectedId={top.id} />}
      {top && children.length > 0 && <CategoryChips key={`chips-${top.id}`} chips={[{ id: top.id, name: "All" }, ...children]} selectedId={id} small />}
      {store ? <ProductList key={`products-${id}`} query={products} emptyText="No products in this category yet." /> : <StoreRequired />}
      <CartBar />
    </View>
  );
}
