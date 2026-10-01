import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { ChevronRight, PackageX } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusStatusBar } from "@/components/focus-status-bar";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { StoreRequired } from "@/components/store-required";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { ApiError } from "@/lib/api";
import { useCardSurface } from "@/lib/app-theme";
import { useDeliveryLocation } from "@/lib/delivery-location";
import { discountPercent, formatMoney, formatPackSize } from "@/lib/format";
import { openCategory } from "@/lib/navigation";
import { useStoreProduct } from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import type { StoreProduct } from "@/lib/types";
import { cn } from "@/lib/utils";

function ProductDetails({ product }: { product: StoreProduct }) {
  const { currency } = useSettings();
  const surface = useCardSurface();
  const { width } = useWindowDimensions();
  const [failed, setFailed] = useState(false);
  const discount = discountPercent(product.sellingPrice, product.mrp);
  const packSize = formatPackSize(product.quantity, product.unit);

  return (
    <ScrollView contentContainerClassName="gap-4 pb-10">
      <View className="items-center justify-center bg-tile" style={{ height: Math.min(width, 420) * 0.85 }}>
        {product.imageUrl && !failed ? (
          <Image source={{ uri: product.imageUrl }} style={{ width: "72%", height: "86%" }} contentFit="contain" onError={() => setFailed(true)} />
        ) : (
          <Text className="text-7xl font-extrabold text-primary">{product.name.charAt(0)}</Text>
        )}
      </View>

      <View className="gap-3 px-4">
        <Pressable onPress={() => openCategory(product.category)} className="flex-row items-center self-start active:opacity-70" hitSlop={6}>
          <Text className="text-sm font-semibold text-primary">{product.category.name}</Text>
          <Icon as={ChevronRight} size={15} className="text-primary" />
        </Pressable>
        <View className="gap-1">
          <Text className="text-2xl font-extrabold leading-tight">{product.name}</Text>
          {packSize && <Text className="text-sm text-muted-foreground">{packSize}</Text>}
        </View>

        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-2xl font-extrabold">{formatMoney(product.sellingPrice, currency)}</Text>
          {discount && (
            <>
              <Text className="text-base text-muted-foreground line-through">MRP {formatMoney(product.mrp!, currency)}</Text>
              <View className="rounded-md bg-primary px-2 py-0.5">
                <Text className="text-xs font-extrabold text-primary-foreground">{discount}% OFF</Text>
              </View>
            </>
          )}
        </View>
        <Text className="text-xs text-muted-foreground">Inclusive of all taxes</Text>

        {!product.inStock && (
          <View className="flex-row items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5">
            <Icon as={PackageX} size={18} className="text-destructive" />
            <Text className="flex-1 text-sm font-semibold text-destructive">Out of stock at your store right now</Text>
          </View>
        )}
      </View>

      {product.description ? (
        <View className={cn("mx-4 gap-2 rounded-lg p-4", surface)}>
          <Text className="text-base font-bold">Product details</Text>
          <Text className="text-sm leading-5 text-muted-foreground">{product.description}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function DetailsSkeleton() {
  const { width } = useWindowDimensions();
  return (
    <View className="gap-4">
      <Skeleton className="w-full rounded-none" style={{ height: Math.min(width, 420) * 0.85 }} />
      <View className="gap-3 px-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-3/4" />
        <Skeleton className="h-7 w-32" />
      </View>
    </View>
  );
}

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { store } = useDeliveryLocation();
  const product = useStoreProduct(store?.id, id);
  const unavailable = product.error instanceof ApiError && product.error.status === 404;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title={product.data?.name ?? ""} />
      {!store ? (
        <StoreRequired />
      ) : product.data ? (
        <ProductDetails product={product.data} />
      ) : product.isPending ? (
        <DetailsSkeleton />
      ) : unavailable ? (
        <Text className="px-8 py-12 text-center text-sm text-muted-foreground">This product isn&apos;t available at your store.</Text>
      ) : (
        <QueryError error={product.error} onRetry={() => product.refetch()} />
      )}
    </View>
  );
}
