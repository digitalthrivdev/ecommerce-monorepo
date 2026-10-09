import { BadgeCheck, Star } from "lucide-react-native";
import { View } from "react-native";

import { StarRating } from "@/components/star-rating";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useCardSurface } from "@/lib/app-theme";
import { formatDate } from "@/lib/format";
import { useProductReviews } from "@/lib/reviews";
import { cn } from "@/lib/utils";

const STAR_COLOR = "#F59E0B";
const ratingsLabel = (count: number) => `${count} ${count === 1 ? "rating" : "ratings"}`;

/** "★ 4.3 · 25 ratings" under the product name; nothing until the product has a rating. */
export function RatingLine({ productId }: { productId: string }) {
  const reviews = useProductReviews(productId);
  const data = reviews.data;
  if (!data?.average) return null;
  return (
    <View className="flex-row items-center gap-1.5 self-start" accessible accessibilityLabel={`Rated ${data.average} out of 5 from ${ratingsLabel(data.count)}`}>
      <View className="flex-row items-center gap-1 rounded-md bg-primary px-1.5 py-0.5">
        <Text className="text-xs font-extrabold text-primary-foreground">{data.average}</Text>
        <Star size={11} color="#FFFFFF" fill="#FFFFFF" />
      </View>
      <Text className="text-xs text-muted-foreground">{ratingsLabel(data.count)}</Text>
    </View>
  );
}

/** Average, how the ratings spread over 1 to 5 stars, and the latest written reviews. */
export function ReviewsCard({ productId }: { productId: string }) {
  const surface = useCardSurface();
  const reviews = useProductReviews(productId);
  const data = reviews.data;
  if (!data?.average) return null;
  const most = Math.max(...data.distribution, 1);

  return (
    <View className={cn("mx-4 gap-4 rounded-lg p-4", surface)}>
      <Text className="text-base font-bold">Ratings & reviews</Text>
      <View className="flex-row items-center gap-5">
        <View className="items-center gap-1">
          <View className="flex-row items-center gap-1">
            <Text className="text-3xl font-extrabold">{data.average}</Text>
            <Star size={22} color={STAR_COLOR} fill={STAR_COLOR} />
          </View>
          <Text className="text-xs text-muted-foreground">{ratingsLabel(data.count)}</Text>
        </View>
        <View className="flex-1 gap-1">
          {[5, 4, 3, 2, 1].map((stars) => (
            <View key={stars} className="flex-row items-center gap-2">
              <Text className="w-3 text-xs text-muted-foreground">{stars}</Text>
              <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <View className={cn("h-full rounded-full", stars <= 2 ? "bg-destructive" : "bg-primary")} style={{ width: `${(data.distribution[stars - 1]! / most) * 100}%` }} />
              </View>
              <Text className="w-6 text-right text-xs tabular-nums text-muted-foreground">{data.distribution[stars - 1]}</Text>
            </View>
          ))}
        </View>
      </View>

      {data.items.map((review) => (
        <View key={review.id} className="gap-1 border-t border-border pt-3">
          <View className="flex-row items-center justify-between">
            <StarRating value={review.rating} label="Rating" size={14} />
            <Text className="text-xs text-muted-foreground">{formatDate(review.updatedAt)}</Text>
          </View>
          <Text className="text-sm leading-5">{review.comment}</Text>
          <View className="flex-row items-center gap-1">
            <Text className="text-xs font-semibold text-muted-foreground">{review.name}</Text>
            <Icon as={BadgeCheck} size={13} className="text-primary" />
            <Text className="text-xs text-muted-foreground">Verified purchase</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
