import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronRight, PackageX, Search, Share2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, Share, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AddToCartButton } from "@/components/add-to-cart";
import { BrandRow } from "@/components/brand-row";
import { CartBar } from "@/components/cart-bar";
import { FocusStatusBar } from "@/components/focus-status-bar";
import { RatingLine, ReviewsCard } from "@/components/product-reviews";
import { ProductRow } from "@/components/product-row";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { WishlistButton } from "@/components/wishlist-button";
import { ApiError } from "@/lib/api";
import { useCardSurface } from "@/lib/app-theme";
import { defaultVariant, exactVariant, imagesFor, pickVariant, sellableValues } from "@/lib/catalog";
import { discountPercent, formatMoney } from "@/lib/format";
import { smallImage } from "@/lib/images";
import { openBrand, openCategory, productShareUrl } from "@/lib/navigation";
import { useAlsoBought, useBrands, useProduct, useProducts } from "@/lib/queries";
import { useSettings } from "@/lib/settings";
import type { ProductDetail, ProductImage } from "@/lib/types";
import { cn } from "@/lib/utils";

type Variant = ProductDetail["variants"][number];

function Gallery({ images, name }: { images: ProductImage[]; name: string }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const height = Math.min(width, 420) * 0.85;
  const shown = images.filter((image) => !failed.includes(image.id));

  if (shown.length === 0) {
    return (
      <View className="items-center justify-center bg-tile" style={{ height }}>
        <Text className="text-7xl font-extrabold text-primary">{name.charAt(0)}</Text>
      </View>
    );
  }

  return (
    <View className="bg-tile" style={{ height }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
      >
        {shown.map((image) => (
          <View key={image.id} className="items-center justify-center" style={{ width, height }}>
            <Image
              source={{ uri: image.url }}
              style={{ width: "72%", height: "86%" }}
              contentFit="contain"
              accessibilityLabel={image.altText ?? name}
              onError={() => setFailed((current) => [...current, image.id])}
            />
          </View>
        ))}
      </ScrollView>
      {shown.length > 1 && (
        <View className="absolute bottom-3 w-full flex-row justify-center gap-1.5">
          {shown.map((image, dot) => (
            <View key={image.id} className={cn("h-1.5 rounded-full", dot === index ? "w-4 bg-primary" : "w-1.5 bg-foreground/25")} />
          ))}
        </View>
      )}
    </View>
  );
}

function Chip({ label, selected, dimmed, onPress }: { label: string; selected: boolean; dimmed: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "min-w-12 items-center rounded-lg border px-3.5 py-2",
        selected ? "border-primary bg-primary/10" : "border-border bg-card active:bg-accent",
        dimmed && !selected && "border-dashed",
      )}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Text className={cn("text-sm font-semibold", selected && "text-primary", dimmed && !selected && "text-muted-foreground")}>{label}</Text>
    </Pressable>
  );
}

/**
 * One row of choices per option. Values not on sale are hidden; ones that don't combine
 * with the other choices, or are out of stock, are dashed and switch the other choices when picked.
 */
function PackCard({ variant, label, selected, onPress }: { variant: Variant; label: string; selected: boolean; onPress: () => void }) {
  const { currency } = useSettings();
  const discount = discountPercent(variant.price, variant.compareAtPrice);

  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "min-w-28 gap-0.5 rounded-lg border px-3 py-2.5",
        selected ? "border-primary bg-primary/10" : "border-border bg-card active:bg-accent",
        !variant.inStock && !selected && "border-dashed",
      )}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Text className={cn("text-sm font-semibold", !variant.inStock && "text-muted-foreground")}>{label}</Text>
      <View className="flex-row items-baseline gap-1.5">
        <Text className="text-[15px] font-extrabold">{formatMoney(variant.price, currency)}</Text>
        {discount && <Text className="text-[11px] text-muted-foreground line-through">{formatMoney(variant.compareAtPrice!, currency)}</Text>}
      </View>
      {!variant.inStock ? (
        <Text className="text-[11px] font-semibold text-destructive">Out of stock</Text>
      ) : discount ? (
        <Text className="text-[11px] font-bold text-primary">{discount}% OFF</Text>
      ) : null}
    </Pressable>
  );
}

function VariantChoices({ product, variant, onSelect }: { product: ProductDetail; variant: Variant; onSelect: (variantId: string) => void }) {
  if (product.options.length === 0) {
    if (product.variants.length < 2) return null;
    return (
      <View className="gap-2">
        <Text className="text-sm font-bold">Select unit</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4" contentContainerClassName="gap-2 px-4">
          {product.variants.map((candidate) => (
            <PackCard
              key={candidate.variantId}
              variant={candidate}
              label={candidate.label || product.name}
              selected={candidate.variantId === variant.variantId}
              onPress={() => onSelect(candidate.variantId)}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {product.options.map((option, optionIndex) => {
        const values = sellableValues(product, optionIndex);
        if (values.length === 0) return null;
        const selected = values.find((value) => variant.optionValueIds.includes(value.id));
        return (
          <View key={option.id} className="gap-2">
            <Text className="text-sm font-bold">
              {option.name}
              {selected && <Text className="text-sm text-muted-foreground">: {selected.value}</Text>}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {values.map((value) => {
                const exact = exactVariant(product, variant, optionIndex, value.id);
                return (
                  <Chip
                    key={value.id}
                    label={value.value}
                    selected={value.id === selected?.id}
                    dimmed={!exact?.inStock}
                    onPress={() => {
                      const next = pickVariant(product, variant, optionIndex, value.id);
                      if (next) onSelect(next.variantId);
                    }}
                  />
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function DetailRows({ title, rows }: { title: string; rows: [string, string][] }) {
  const surface = useCardSurface();
  if (rows.length === 0) return null;

  return (
    <View className={cn("mx-4 gap-3 rounded-lg p-4", surface)}>
      <Text className="text-base font-bold">{title}</Text>
      {rows.map(([label, value], index) => (
        <View key={`${index}:${label}`} className="gap-0.5">
          <Text className="text-xs font-semibold text-muted-foreground">{label}</Text>
          <Text className="text-sm leading-5">{value}</Text>
        </View>
      ))}
    </View>
  );
}

function LabelDetails({ product }: { product: ProductDetail }) {
  const manufacturer = [product.manufacturerName, product.manufacturerAddress].filter(Boolean).join(", ");
  const rows = [
    ["Brand", product.brand?.name],
    ["Manufacturer", manufacturer],
    ["Country of origin", product.countryOfOrigin],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return <DetailRows title="Label details" rows={rows} />;
}

type DetailsProps = { product: ProductDetail; variant: Variant; onSelect: (variantId: string) => void };

function ProductDetails({ product, variant, onSelect }: DetailsProps) {
  const { currency } = useSettings();
  const surface = useCardSurface();
  const discount = discountPercent(variant.price, variant.compareAtPrice);

  return (
    <ScrollView contentContainerClassName="gap-4 pb-10">
      <Gallery key={variant.variantId} images={imagesFor(product.images, variant.variantId)} name={product.name} />

      <View className="gap-3 px-4">
        <Pressable onPress={() => openCategory(product.category)} className="flex-row items-center self-start active:opacity-70" hitSlop={6}>
          <Text className="text-sm font-semibold text-primary">{product.category.name}</Text>
          <Icon as={ChevronRight} size={15} className="text-primary" />
        </Pressable>
        <View className="gap-1">
          {product.brand && <Text className="text-xs font-semibold uppercase text-muted-foreground">{product.brand.name}</Text>}
          <View className="flex-row items-start gap-2">
            <Text className="flex-1 text-2xl font-extrabold leading-tight">{product.name}</Text>
          </View>
          {variant.label ? <Text className="text-sm text-muted-foreground">{variant.label}</Text> : null}
          <RatingLine productId={product.productId} />
        </View>

        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-2xl font-extrabold">{formatMoney(variant.price, currency)}</Text>
          {discount && (
            <>
              <Text className="text-base text-muted-foreground line-through">{formatMoney(variant.compareAtPrice!, currency)}</Text>
              <View className="rounded-md bg-primary px-2 py-0.5">
                <Text className="text-xs font-extrabold text-primary-foreground">{discount}% OFF</Text>
              </View>
            </>
          )}
        </View>
        <Text className="text-xs text-muted-foreground">Inclusive of all taxes</Text>

        <VariantChoices product={product} variant={variant} onSelect={onSelect} />

        {!variant.inStock && (
          <View className="flex-row items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5">
            <Icon as={PackageX} size={18} className="text-destructive" />
            <Text className="flex-1 text-sm font-semibold text-destructive">Out of stock right now</Text>
          </View>
        )}
      </View>

      {product.brand && <BrandLink brand={product.brand} />}

      {product.description ? (
        <View className={cn("mx-4 gap-2 rounded-lg p-4", surface)}>
          <Text className="text-base font-bold">Product details</Text>
          <Text className="text-sm leading-5 text-muted-foreground">{product.description}</Text>
        </View>
      ) : null}

      <DetailRows title="Specifications" rows={product.specifications.map((spec) => [spec.name, spec.value])} />

      <LabelDetails product={product} />

      <ReviewsCard productId={product.productId} />

      <SimilarProducts product={product} />
      <AlsoBought product={product} />
      <CategoryBrands product={product} />
    </ScrollView>
  );
}

function BrandLink({ brand }: { brand: NonNullable<ProductDetail["brand"]> }) {
  const surface = useCardSurface();
  const [failed, setFailed] = useState(false);
  return (
    <Pressable onPress={() => openBrand(brand)} className={cn("mx-4 flex-row items-center gap-3 rounded-lg p-3 active:opacity-80", surface)}>
      <View className="size-11 items-center justify-center overflow-hidden rounded-md bg-tile">
        {brand.logoUrl && !failed ? (
          <Image source={{ uri: smallImage(brand.logoUrl) }} style={{ width: "80%", height: "80%" }} contentFit="contain" onError={() => setFailed(true)} />
        ) : (
          <Text className="text-lg font-extrabold text-primary">{brand.name.charAt(0)}</Text>
        )}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold" numberOfLines={1}>
          {brand.name}
        </Text>
        <Text className="text-xs text-muted-foreground">Explore all products</Text>
      </View>
      <Icon as={ChevronRight} size={18} className="text-muted-foreground" />
    </Pressable>
  );
}

const SIMILAR_LIMIT = 10;
const BRANDS_LIMIT = 12;

/** Other products in the same category. */
function SimilarProducts({ product }: { product: ProductDetail }) {
  const query = useProducts({ categoryId: product.category.id });
  const similar = (query.data?.pages[0]?.items ?? []).filter((candidate) => candidate.productId !== product.productId).slice(0, SIMILAR_LIMIT);
  return <ProductRow title="Similar products" products={similar} onSeeAll={() => openCategory(product.category)} />;
}

function AlsoBought({ product }: { product: ProductDetail }) {
  const query = useAlsoBought([product.productId]);
  return <ProductRow title="People also bought" products={query.data?.items ?? []} />;
}

/** Brands in this product's category; a lone brand would just repeat the brand link above. */
function CategoryBrands({ product }: { product: ProductDetail }) {
  const query = useBrands({ categoryId: product.category.id, limit: BRANDS_LIMIT });
  const brands = query.data?.items ?? [];
  if (brands.length < 2) return null;
  return <BrandRow title={`Top brands in ${product.category.name}`} brands={brands} />;
}

type HeaderActionsProps = { productId: string; product: ProductDetail | undefined; variant: Variant | undefined };

function HeaderActions({ productId, product, variant }: HeaderActionsProps) {
  const { appName, currency } = useSettings();

  function share() {
    if (!product || !variant) return;
    const url = productShareUrl(product.productId);
    const name = variant.label ? `${product.name} (${variant.label})` : product.name;
    Share.share({ message: `${name} for ${formatMoney(variant.price, currency)} on ${appName}\n${url}` }).catch(() => {});
  }

  return (
    <View className="flex-row">
      <Pressable onPress={() => router.push("/search")} className="size-11 items-center justify-center rounded-full active:bg-accent" accessibilityLabel="Search" hitSlop={4}>
        <Icon as={Search} size={22} />
      </Pressable>
      <WishlistButton productId={productId} className="size-11 active:bg-accent" />
      <Pressable
        onPress={share}
        disabled={!product || !variant}
        className="size-11 items-center justify-center rounded-full active:bg-accent disabled:opacity-40"
        accessibilityLabel="Share"
        hitSlop={4}
      >
        <Icon as={Share2} size={21} />
      </Pressable>
    </View>
  );
}

function ProductFooter({ product, variant }: { product: ProductDetail; variant: Variant }) {
  const insets = useSafeAreaInsets();
  const { currency } = useSettings();

  return (
    <View className="gap-1 border-t border-border bg-card pt-3" style={{ paddingBottom: insets.bottom + 4 }}>
      <View className="flex-row items-center justify-between gap-3 px-4 pb-2">
        <View className="shrink">
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {variant.label || product.name}
          </Text>
          <Text className="text-lg font-extrabold">{formatMoney(variant.price, currency)}</Text>
        </View>
        <AddToCartButton product={product} variant={variant} size="lg" />
      </View>
      <CartBar inset={false} className="bg-card pt-0" />
    </View>
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
  const { id, variant: openedVariantId } = useLocalSearchParams<{ id: string; variant?: string }>();
  const insets = useSafeAreaInsets();
  const product = useProduct(id);
  const [selectedId, setSelectedId] = useState(openedVariantId);
  const variants = product.data?.variants ?? [];
  const variant = variants.find((candidate) => candidate.variantId === selectedId) ?? defaultVariant(variants);
  const unavailable = (product.error instanceof ApiError && product.error.status === 404) || (product.data && !variant);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title={product.data?.name ?? ""} right={<HeaderActions productId={id} product={product.data} variant={variant} />} />
      {unavailable ? (
        <Text className="px-8 py-12 text-center text-sm text-muted-foreground">This product isn&apos;t available.</Text>
      ) : product.data && variant ? (
        <>
          <ProductDetails product={product.data} variant={variant} onSelect={setSelectedId} />
          <ProductFooter product={product.data} variant={variant} />
        </>
      ) : product.isPending ? (
        <DetailsSkeleton />
      ) : (
        <QueryError error={product.error} onRetry={() => product.refetch()} />
      )}
    </View>
  );
}
