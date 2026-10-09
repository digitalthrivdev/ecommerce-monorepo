import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FocusStatusBar } from "@/components/focus-status-bar";
import { FormField } from "@/components/form-field";
import { QueryError } from "@/components/query-error";
import { ScreenHeader } from "@/components/screen-header";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";
import { useAppTheme } from "@/lib/app-theme";
import { smallImage } from "@/lib/images";
import { RATING_TEXT, useOrderReviews, useReviewProduct } from "@/lib/reviews";
import type { OrderReviewItem } from "@/lib/types";

const MAX_COMMENT = 500;

function ReviewForm({ item, orderId }: { item: OrderReviewItem; orderId: string }) {
  const insets = useSafeAreaInsets();
  const save = useReviewProduct(orderId);
  const [rating, setRating] = useState(item.rating ?? 0);
  const [comment, setComment] = useState(item.comment ?? "");
  const [failed, setFailed] = useState(false);

  const submit = () =>
    save.mutate(
      { productId: item.productId, rating, comment: comment.trim() || null },
      { onSuccess: () => router.back(), onError: (error) => Alert.alert("Couldn't save your review", errorMessage(error)) },
    );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
      <ScrollView contentContainerClassName="gap-5 p-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View className="flex-row items-center gap-3">
          <View className="size-16 items-center justify-center overflow-hidden rounded-md bg-tile">
            {item.imageUrl && !failed ? (
              <Image source={{ uri: smallImage(item.imageUrl) }} style={{ width: "86%", height: "86%" }} contentFit="contain" onError={() => setFailed(true)} />
            ) : (
              <Text className="text-xl font-extrabold text-primary">{item.productName.charAt(0)}</Text>
            )}
          </View>
          <Text className="flex-1 text-base font-bold" numberOfLines={3}>
            {item.productName}
          </Text>
        </View>

        <View className="items-center gap-2">
          <StarRating value={rating} onChange={setRating} label="Your rating" size={40} />
          <Text className="text-sm font-semibold text-muted-foreground">{rating > 0 ? RATING_TEXT[rating] : "Tap a star to rate"}</Text>
        </View>

        <FormField
          label="Your review"
          optional
          value={comment}
          onChangeText={setComment}
          placeholder="What did you like or dislike? How was the quality and freshness?"
          multiline
          maxLength={MAX_COMMENT}
          textAlignVertical="top"
          className="h-32 py-3"
        />
        <Text className="-mt-3 text-xs text-muted-foreground">Your first name and last initial are shown with your review.</Text>

        <Button onPress={submit} disabled={rating === 0 || save.isPending} className="h-12 rounded-lg">
          <Text className="font-semibold">{save.isPending ? "Saving…" : "Submit review"}</Text>
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function ReviewScreen() {
  const { productId, orderId } = useLocalSearchParams<{ productId: string; orderId: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const reviews = useOrderReviews(orderId, { enabled: true });
  const item = reviews.data?.items.find((candidate) => candidate.productId === productId);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <FocusStatusBar />
      <ScreenHeader title={item?.rating ? "Edit your review" : "Write a review"} />
      {item ? (
        <ReviewForm item={item} orderId={orderId} />
      ) : reviews.isPending ? (
        <ActivityIndicator color={colors.primary} className="py-12" />
      ) : reviews.error ? (
        <QueryError error={reviews.error} onRetry={() => reviews.refetch()} />
      ) : (
        <Text className="px-8 py-10 text-center text-sm text-muted-foreground">You can review products from your delivered orders.</Text>
      )}
    </View>
  );
}
