import { isHexColor, readableOn } from "@/lib/color";
import { getSettings } from "@/lib/website";

/** Paints the website in the brand colours from Appearance. Falls back to the defaults in globals.css. */
export async function BrandStyle() {
  const settings = await getSettings().catch(() => null);
  const colors = settings?.theme.colors;
  if (!colors || ![colors.primary, colors.onPrimary, colors.accent, colors.onAccent].every(isHexColor)) return null;

  const css =
    `:root:root{--primary:${colors.primary};--primary-foreground:${colors.onPrimary};` +
    `--accent:${colors.accent};--accent-foreground:${colors.onAccent};--primary-ink:${readableOn(colors.primary)};}`;
  return <style>{css}</style>;
}
