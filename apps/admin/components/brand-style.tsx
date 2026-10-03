import { isHexColor, readableOn } from "@/lib/appearance";
import { getPublicSettings } from "@/lib/dal";

/** Paints the dashboard in the client's brand colours from Appearance. Falls back to the defaults in globals.css. */
export async function BrandStyle() {
  const settings = await getPublicSettings().catch(() => null);
  const colors = settings?.theme?.colors;
  if (!colors || !isHexColor(colors.primary) || !isHexColor(colors.onPrimary)) return null;

  const css =
    `:root:root{--primary:${colors.primary};--primary-foreground:${colors.onPrimary};}` +
    `:root:root:not(.dark){--primary-ink:${readableOn(colors.primary)};}`;
  return <style>{css}</style>;
}
