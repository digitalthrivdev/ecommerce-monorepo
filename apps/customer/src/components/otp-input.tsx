import { useRef, useState } from "react";
import { TextInput, View } from "react-native";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type OtpInputProps = { value: string; onChange: (value: string) => void; length?: number; invalid?: boolean; editable?: boolean };

/** One box per digit over a single hidden input, so paste and SMS autofill work. */
export function OtpInput({ value, onChange, length = 6, invalid = false, editable = true }: OtpInputProps) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <View className="relative flex-row gap-2">
      {Array.from({ length }, (_, index) => {
        const active = focused && index === activeIndex;
        return (
          <View
            key={index}
            className={cn(
              "h-14 flex-1 items-center justify-center rounded-lg border bg-card",
              invalid ? "border-destructive" : active ? "border-2 border-primary" : value[index] ? "border-foreground/30" : "border-input",
            )}
          >
            <Text className="text-2xl font-bold">{value[index] ?? ""}</Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, "").slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={length}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        editable={editable}
        caretHidden
        accessibilityLabel="Verification code"
        className="absolute inset-0 text-transparent opacity-0"
      />
    </View>
  );
}
