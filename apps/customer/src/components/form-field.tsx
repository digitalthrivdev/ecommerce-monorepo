import type { ComponentProps, ReactNode } from "react";
import { View } from "react-native";

import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type FormFieldProps = ComponentProps<typeof Input> & { label: string; error?: string; optional?: boolean; prefix?: ReactNode };

export function FormField({ label, error, optional = false, prefix, className, ...props }: FormFieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold">
        {label}
        {optional && <Text className="text-sm font-normal text-muted-foreground"> (optional)</Text>}
      </Text>
      <View className="flex-row items-center">
        {prefix}
        <Input
          className={cn("h-12 flex-1 rounded-lg bg-card text-[15px]", prefix ? "rounded-l-none" : null, error && "border-destructive", className)}
          aria-invalid={Boolean(error)}
          {...props}
        />
      </View>
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}
