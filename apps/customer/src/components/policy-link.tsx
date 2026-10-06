import * as WebBrowser from "expo-web-browser";
import type { PropsWithChildren } from "react";

import { Text } from "@/components/ui/text";

export function openPolicy(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => {});
}

/** Inline link to a public policy page, for use inside a <Text>. Plain text when there is no page. */
export function PolicyLink({ url, children }: PropsWithChildren<{ url: string | undefined }>) {
  if (!url) return <>{children}</>;
  return (
    <Text accessibilityRole="link" onPress={() => openPolicy(url)} className="text-xs font-semibold text-foreground underline">
      {children}
    </Text>
  );
}
