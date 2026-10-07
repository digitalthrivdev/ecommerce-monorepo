import { Star } from "lucide-react-native";
import { Pressable, View } from "react-native";

import { useAppTheme } from "@/lib/app-theme";

const STAR_COLOR = "#F59E0B";
const STARS = [1, 2, 3, 4, 5] as const;

type StarRatingProps = {
  /** 0 when nothing is chosen yet. */
  value: number;
  /** Without it the stars are read-only. */
  onChange?: (value: number) => void;
  label: string;
  size?: number;
};

/** 1 to 5 stars, tappable when `onChange` is given. */
export function StarRating({ value, onChange, label, size = 32 }: StarRatingProps) {
  const { neutral } = useAppTheme();
  const star = (count: number) => (
    <Star size={size} color={count <= value ? STAR_COLOR : neutral.mutedForeground} fill={count <= value ? STAR_COLOR : "transparent"} strokeWidth={1.75} />
  );

  if (!onChange) {
    return (
      <View className="flex-row gap-0.5" accessible accessibilityLabel={`${label}: ${value} out of 5 stars`}>
        {STARS.map((count) => (
          <View key={count}>{star(count)}</View>
        ))}
      </View>
    );
  }

  return (
    <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel={label}>
      {STARS.map((count) => (
        <Pressable
          key={count}
          onPress={() => onChange(count)}
          hitSlop={4}
          className="active:opacity-70"
          accessibilityRole="radio"
          accessibilityState={{ checked: value === count }}
          accessibilityLabel={`${count} ${count === 1 ? "star" : "stars"}`}
        >
          {star(count)}
        </Pressable>
      ))}
    </View>
  );
}
