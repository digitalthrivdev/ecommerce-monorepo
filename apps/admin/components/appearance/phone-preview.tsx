"use client";

import { Search, ShoppingBasket, UserRound } from "lucide-react";
import type { CSSProperties } from "react";

import type { Appearance, Category, HomeSection } from "@/lib/types";

type Palette = { background: string; surface: string; border: string; text: string; muted: string; placeholder: string };

const LIGHT: Palette = { background: "#F5F6F8", surface: "#FFFFFF", border: "#E8E8E8", text: "#1C1C1C", muted: "#6B6B6B", placeholder: "#EEF0F3" };
const DARK: Palette = { background: "#0F1012", surface: "#1A1C1F", border: "#2A2D31", text: "#F2F2F2", muted: "#9A9DA3", placeholder: "#25282C" };

function cardStyle(appearance: Appearance, palette: Palette, dark: boolean): CSSProperties {
  const radius = appearance.theme.radius;
  switch (appearance.theme.cardStyle) {
    case "outlined":
      return { borderRadius: radius, backgroundColor: palette.surface, border: `1px solid ${palette.border}` };
    case "elevated":
      return { borderRadius: radius, backgroundColor: palette.surface, boxShadow: dark ? "0 1px 3px rgba(0,0,0,.6)" : "0 2px 8px rgba(0,0,0,.08)" };
    case "flat":
      return { borderRadius: radius, backgroundColor: dark ? palette.surface : palette.placeholder };
  }
}

function SectionPreview({ section, appearance, categories, palette, dark }: { section: HomeSection; appearance: Appearance; categories: Category[]; palette: Palette; dark: boolean }) {
  const { radius, colors } = appearance.theme;
  const card = cardStyle(appearance, palette, dark);
  const title = (text: string | null) => (text ? <p className="px-3 pb-2 text-[13px] font-bold" style={{ color: palette.text }}>{text}</p> : null);

  switch (section.type) {
    case "banner_carousel": {
      const banner = section.banners[0];
      return (
        <div className="px-3">
          <div className="relative aspect-[2/1] overflow-hidden" style={{ borderRadius: radius, backgroundColor: palette.placeholder }}>
            {banner?.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- admin-entered URLs from any host
              <img src={banner.imageUrl} alt="" className="size-full object-cover" />
            )}
            {(banner?.title || banner?.subtitle) && (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2.5 text-white">
                {banner.title && <p className="text-[13px] leading-tight font-bold">{banner.title}</p>}
                {banner.subtitle && <p className="text-[10px] opacity-90">{banner.subtitle}</p>}
              </div>
            )}
          </div>
          {section.banners.length > 1 && (
            <div className="mt-1.5 flex justify-center gap-1">
              {section.banners.map((item, index) => (
                <span key={item.id} className="h-1 rounded-full" style={{ width: index === 0 ? 12 : 4, backgroundColor: index === 0 ? colors.primary : palette.border }} />
              ))}
            </div>
          )}
        </div>
      );
    }

    case "category_grid": {
      const active = categories.filter((category) => category.isActive);
      const shown = section.categoryIds.length
        ? section.categoryIds.map((id) => categories.find((category) => category.id === id)).filter((category): category is Category => Boolean(category))
        : active;
      return (
        <div>
          {title(section.title)}
          <div className="grid gap-x-2 gap-y-2.5 px-3" style={{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }}>
            {shown.slice(0, section.columns * 2).map((category) => (
              <div key={category.id} className="flex flex-col items-center gap-1">
                <div className="flex aspect-square w-full items-center justify-center overflow-hidden" style={{ ...card, backgroundColor: dark ? palette.surface : "#E9F4FB" }}>
                  {category.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin-entered URLs from any host
                    <img src={category.imageUrl} alt="" className="size-4/5 object-contain" />
                  ) : (
                    <span className="text-base font-bold" style={{ color: colors.primary }}>{category.name.charAt(0)}</span>
                  )}
                </div>
                <p className="line-clamp-2 text-center text-[9px] leading-tight font-medium" style={{ color: palette.text }}>{category.name}</p>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "product_rail":
      return (
        <div>
          {title(section.title)}
          <div className="flex gap-2 overflow-hidden px-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="flex w-[92px] shrink-0 flex-col gap-1 p-1.5" style={card}>
                <div className="aspect-square" style={{ borderRadius: Math.max(radius - 4, 0), backgroundColor: palette.placeholder }} />
                <span className="w-fit rounded px-1 text-[8px] font-semibold" style={{ backgroundColor: palette.placeholder, color: palette.muted }}>8 MINS</span>
                <div className="h-2 w-4/5 rounded" style={{ backgroundColor: palette.placeholder }} />
                <div className="h-2 w-1/2 rounded" style={{ backgroundColor: palette.placeholder }} />
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] font-bold" style={{ color: palette.text }}>₹{48 + index * 21}</span>
                  <span
                    className="px-2 py-0.5 text-[9px] font-bold"
                    style={{ borderRadius: Math.min(radius, 8), border: `1px solid ${colors.primary}`, color: colors.primary, backgroundColor: dark ? "transparent" : `${colors.primary}0F` }}
                  >
                    ADD
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case "offer_strip":
      return (
        <div className="px-3">
          <div className="flex items-center gap-2 overflow-hidden p-3" style={{ borderRadius: radius, backgroundColor: section.backgroundColor, color: section.textColor }}>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] leading-tight font-bold">{section.title}</p>
              {section.subtitle && <p className="mt-0.5 text-[10px] opacity-85">{section.subtitle}</p>}
            </div>
            {section.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- admin-entered URLs from any host
              <img src={section.imageUrl} alt="" className="size-10 shrink-0 object-contain" />
            )}
          </div>
        </div>
      );
  }
}

type PhonePreviewProps = { appearance: Appearance; categories: Category[]; dark: boolean };

export function PhonePreview({ appearance, categories, dark }: PhonePreviewProps) {
  const palette = dark ? DARK : LIGHT;
  const { colors, radius } = appearance.theme;
  const { announcement } = appearance;
  const sections = appearance.homeSections.filter((section) => section.enabled);

  return (
    <div className="mx-auto w-[300px] rounded-[44px] border-[10px] border-neutral-900 bg-neutral-900 shadow-xl">
      <div className="relative h-[600px] overflow-hidden rounded-[34px]" style={{ backgroundColor: palette.background }}>
        <div className="h-full overflow-y-auto pb-16 [scrollbar-width:none]">
          <div className="px-3 pt-8 pb-3" style={{ background: `linear-gradient(180deg, ${colors.accent} 0%, ${colors.accent} 70%, ${palette.background} 100%)`, color: colors.onAccent }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {appearance.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- admin-entered URLs from any host
                    <img src={appearance.logoUrl} alt="" className="size-5 rounded object-contain" />
                  )}
                  <p className="truncate text-[11px] font-semibold opacity-80">{appearance.appName || "Your app"} in</p>
                </div>
                <p className="text-[22px] leading-tight font-extrabold">12 minutes</p>
                <p className="truncate text-[11px] font-medium">
                  <span className="font-bold">HOME</span> · 221B MG Road, Bengaluru ▾
                </p>
              </div>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: palette.surface, color: palette.text }}>
                <UserRound className="size-4" />
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 px-3 py-2 text-[11px]" style={{ borderRadius: Math.max(radius, 8), backgroundColor: palette.surface, color: palette.muted, border: `1px solid ${palette.border}` }}>
              <Search className="size-3.5" />
              Search &quot;milk&quot;
            </div>
          </div>

          {announcement.enabled && announcement.text && (
            <div
              className="mx-3 mb-3 px-3 py-1.5 text-center text-[10px] font-semibold"
              style={{
                borderRadius: Math.min(radius, 8),
                backgroundColor: announcement.backgroundColor ?? colors.primary,
                color: announcement.textColor ?? colors.onPrimary,
              }}
            >
              {announcement.text}
            </div>
          )}

          <div className="flex flex-col gap-4">
            {sections.length === 0 ? (
              <p className="px-6 py-10 text-center text-[11px]" style={{ color: palette.muted }}>No visible sections on the home screen.</p>
            ) : (
              sections.map((section) => <SectionPreview key={section.id} section={section} appearance={appearance} categories={categories} palette={palette} dark={dark} />)
            )}
          </div>
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 px-3 py-2" style={{ borderRadius: Math.max(radius, 10), backgroundColor: colors.primary, color: colors.onPrimary }}>
          <ShoppingBasket className="size-4" />
          <div className="flex-1 text-[10px] leading-tight">
            <p className="font-bold">2 items</p>
            <p className="opacity-85">₹117</p>
          </div>
          <span className="text-[11px] font-bold">View cart ›</span>
        </div>
      </div>
    </div>
  );
}
