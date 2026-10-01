import { RefreshCw } from "lucide-react-native";
import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { errorMessage } from "@/lib/api";

/** Inline message for a failed request, with a retry button. */
export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View className="items-center gap-3 px-8 py-6">
      <Text className="text-center text-sm text-muted-foreground">{errorMessage(error)}</Text>
      <Button variant="outline" size="sm" onPress={onRetry}>
        <Icon as={RefreshCw} />
        <Text>Retry</Text>
      </Button>
    </View>
  );
}
