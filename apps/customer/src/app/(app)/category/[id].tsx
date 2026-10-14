import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Search } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CartBar } from "@/components/cart-bar";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { ProductList } from "@/components/product-list";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { subCategories } from "@/lib/catalog";
import { smallImage } from "@/lib/images";
import { useCategories, useProducts } from "@/lib/queries";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

const SIDEBAR_WIDTH = 84;

type RailItem = { id: string; name: string; imageUrl: string | null };

/** The sub-categories down the left, each with its picture, like the aisles of a shop. */
function SubCategoryRail({ items, selectedId }: { items: RailItem[]; selectedId: string }) {
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef(new Map<string, number>());

  useEffect(() => {
    const y = offsets.current.get(selectedId);
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
  }, [selectedId]);

  return (
    <ScrollView
      ref={scrollRef}
      showsVerticalScrollIndicator={false}
      style={{ width: SIDEBAR_WIDTH }}
      className="shrink-0 grow-0 border-r border-border"
      contentContainerClassName="pb-6"
    >
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <Pressable
            key={item.id}
            onLayout={(event) => {
              offsets.current.set(item.id, event.nativeEvent.layout.y);
              if (selected) scrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 80), animated: false });
            }}
            onPress={() => router.setParams({ id: item.id, name: item.name })}
            className={cn("items-center px-1 py-2.5", selected ? "bg-primary/5" : "active:bg-accent")}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <View className={cn("size-14 items-center justify-center overflow-hidden rounded-full", selected ? "bg-primary/15" : "bg-tile")}>
              {item.imageUrl ? (
                <Image source={{ uri: smallImage(item.imageUrl) }} style={{ width: "82%", height: "82%" }} contentFit="contain" />
              ) : (
                <Text className="text-lg font-extrabold text-primary">{item.name.charAt(0)}</Text>
              )}
            </View>
            <Text
              className={cn("mt-1.5 text-center text-[11px] leading-tight", selected ? "font-bold" : "font-medium text-muted-foreground")}
              numberOfLines={3}
            >
              {item.name}
            </Text>
            {selected && <View className="absolute bottom-2 right-0 top-2 w-1 rounded-l-full bg-primary" />}
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
  const { width } = useWindowDimensions();
  const categories = useCategories();
  const products = useProducts({ categoryId: id });
  const { current, top, children } = categoryContext(categories.data?.items ?? [], id);
  const title = top?.name ?? current?.name ?? name ?? "Products";
  const rail = top && children.length > 0 ? [{ id: top.id, name: "All", imageUrl: top.imageUrl }, ...children] : [];

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <View className="flex-row items-center gap-1 border-b border-border px-2 py-1.5">
        <Pressable onPress={() => router.back()} className="size-11 items-center justify-center rounded-full active:bg-accent" accessibilityLabel="Back" hitSlop={8}>
          <Icon as={ArrowLeft} size={22} />
        </Pressable>
        <Text className="flex-1 px-1 text-base font-bold" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        <Pressable onPress={() => router.push("/search")} className="size-11 items-center justify-center rounded-full active:bg-accent" accessibilityLabel="Search" hitSlop={8}>
          <Icon as={Search} size={21} />
        </Pressable>
      </View>
      <View className="flex-1 flex-row">
        {rail.length > 0 && <SubCategoryRail key={`rail-${top?.id}`} items={rail} selectedId={id} />}
        <View className="flex-1">
          <ProductList
            key={`products-${id}`}
            query={products}
            emptyText="No products in this category yet."
            width={rail.length > 0 ? width - SIDEBAR_WIDTH : width}
            sidePadding={rail.length > 0 ? 10 : 16}
          />
        </View>
      </View>
      <CartBar />
    </View>
  );
}
