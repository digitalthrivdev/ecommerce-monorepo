import { useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type OtpInputProps = { value: string; onChange: (value: string) => void; length?: number; invalid?: boolean; editable?: boolean; autoFocus?: boolean };

/** One box per digit over a single hidden input, so paste and SMS autofill work. */
export function OtpInput({ value, onChange, length = 6, invalid = false, editable = true, autoFocus = true }: OtpInputProps) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, length - 1);

  // Android keeps the input focused after Back closes the keyboard, and focusing it again doesn't reopen it.
  function openKeyboard() {
    if (!editable) return;
    if (input.current?.isFocused()) input.current.blur();
    setTimeout(() => input.current?.focus(), 50);
  }

  return (
    <Pressable onPress={openKeyboard} className="relative flex-row gap-2" accessibilityLabel="Enter the code" accessibilityRole="button">
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
        autoFocus={autoFocus}
        editable={editable}
        caretHidden
        pointerEvents="none"
        accessibilityLabel="Verification code"
        className="absolute inset-0 text-transparent opacity-0"
      />
    </Pressable>
  );
}
