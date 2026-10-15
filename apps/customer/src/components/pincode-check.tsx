import { useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Check, MapPin } from "lucide-react-native";
import { useAppTheme, useCardSurface } from "@/lib/app-theme";
import { useServiceability } from "@/lib/serviceability";
import { cn } from "@/lib/utils";

export function PincodeCheck({ weightGrams = 0 }: { weightGrams?: number }) {
  const surface = useCardSurface();
  const { colors } = useAppTheme();
  const [pincode, setPincode] = useState("");
  const [checked, setChecked] = useState("");
  const query = useServiceability(checked, weightGrams);

  return (
    <View className={cn("mx-4 gap-3 rounded-lg p-4", surface)}>
      <View className="flex-row items-center gap-2">
        <Icon as={MapPin} size={19} className="text-primary" />
        <Text className="text-base font-bold">Check delivery availability</Text>
      </View>
      <View className="flex-row gap-2">
        <Input value={pincode} onChangeText={(value) => { setPincode(value.replace(/\D/g, "").slice(0, 6)); setChecked(""); }} placeholder="6-digit PIN code" keyboardType="number-pad" maxLength={6} className="flex-1" />
        <Button onPress={() => setChecked(pincode.length === 6 ? pincode : "")} disabled={pincode.length !== 6} className="h-11 rounded-lg px-4">
          <Text className="font-semibold">Check</Text>
        </Button>
      </View>
      {checked && query.isFetching ? <ActivityIndicator color={colors.primary} /> : null}
      {query.isError ? <Text className="text-sm text-destructive">Unable to check this PIN code. Try again.</Text> : null}
      {query.data ? (
        <View className="flex-row items-start gap-2">
          <Icon as={query.data.serviceable ? Check : MapPin} size={17} className={query.data.serviceable ? "text-primary" : "text-destructive"} />
          <Text className="flex-1 text-sm text-muted-foreground">
            {query.data.serviceable
              ? `Delivery is available${query.data.etaDays ? ` in about ${query.data.etaDays} days` : ""}. ${query.data.codAvailable ? "Cash on delivery is available." : "Cash on delivery is not available here."}`
              : "Delivery isn't available at this PIN code."}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
