import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";

import { useCategories } from "./queries";

const HINT_MS = 3000;
const MAX_HINTS = 8;
const FALLBACK_HINT = "milk";

/** What to suggest typing: sub-category names (usually short, like "Milk"), else top-level ones. */
function useHintWords() {
  const categories = useCategories();
  return useMemo(() => {
    const items = categories.data?.items ?? [];
    const subcategories = items.filter((category) => category.parentId !== null);
    const words = (subcategories.length > 0 ? subcategories : items).map((category) => category.name.toLowerCase()).slice(0, MAX_HINTS);
    return words.length > 0 ? words : [FALLBACK_HINT];
  }, [categories.data]);
}

/** A search hint that changes every few seconds while the screen is focused. */
export function useRotatingSearchHint() {
  const words = useHintWords();
  const [index, setIndex] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (words.length < 2) return;
      const timer = setInterval(() => setIndex((current) => current + 1), HINT_MS);
      return () => clearInterval(timer);
    }, [words.length]),
  );

  return words[index % words.length]!;
}
