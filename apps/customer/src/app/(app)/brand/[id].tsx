import { router, useLocalSearchParams } from "expo-router";
import { Search } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CartBar } from "@/components/cart-bar";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { ProductList } from "@/components/product-list";
import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/ui/icon";
import { useProducts } from "@/lib/queries";

export default function BrandScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const products = useProducts({ brandId: id });

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader
        title={name ?? "Brand"}
        right={
          <Pressable onPress={() => router.push("/search")} className="size-11 items-center justify-center rounded-full active:bg-accent" accessibilityLabel="Search" hitSlop={8}>
            <Icon as={Search} size={21} />
          </Pressable>
        }
      />
      <ProductList query={products} emptyText="No products from this brand yet." />
      <CartBar />
    </View>
  );
}
