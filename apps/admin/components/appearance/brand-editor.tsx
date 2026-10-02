"use client";

import { ColorField } from "@/components/appearance/color-field";
import { Button } from "@/components/ui/button";
import { ImageField } from "@/components/image-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { COLOR_PRESETS } from "@/lib/appearance";
import { cn } from "@/lib/utils";
import type { Appearance, AppearanceTheme } from "@/lib/types";

type BrandEditorProps = {
  value: Appearance;
  onChange: (next: Appearance) => void;
  errors: Record<string, string>;
};

const CARD_STYLES: { value: AppearanceTheme["cardStyle"]; label: string }[] = [
  { value: "outlined", label: "Outlined" },
  { value: "elevated", label: "Shadow" },
  { value: "flat", label: "Flat" },
];

const COLOR_SCHEMES: { value: AppearanceTheme["colorScheme"]; label: string }[] = [
  { value: "light", label: "Always light" },
  { value: "dark", label: "Always dark" },
  { value: "system", label: "Follow the phone setting" },
];

export function BrandEditor({ value, onChange, errors }: BrandEditorProps) {
  const { theme, announcement } = value;
  const setTheme = (patch: Partial<AppearanceTheme>) => onChange({ ...value, theme: { ...theme, ...patch } });
  const setColor = (key: keyof AppearanceTheme["colors"]) => (color: string) => setTheme({ colors: { ...theme.colors, [key]: color } });
  const setAnnouncement = (patch: Partial<Appearance["announcement"]>) => onChange({ ...value, announcement: { ...announcement, ...patch } });
  const customAnnouncementColors = announcement.backgroundColor !== null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Shown in the app header and on the sign-in screen.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.appName)}>
              <FieldLabel htmlFor="appearance-name">App name</FieldLabel>
              <Input id="appearance-name" value={value.appName} maxLength={50} onChange={(event) => onChange({ ...value, appName: event.target.value })} aria-invalid={Boolean(errors.appName)} />
              <FieldError>{errors.appName}</FieldError>
            </Field>
            <ImageField
              id="appearance-logo"
              label="Logo"
              value={value.logoUrl ?? ""}
              onChange={(logoUrl) => onChange({ ...value, logoUrl: logoUrl.trim() || null })}
              error={errors.logoUrl}
              description="A square image with a transparent background works best. Leave empty to show the app name instead."
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Colours</CardTitle>
          <CardDescription>Start from a palette, then fine-tune. The primary colour is used for buttons and prices; the accent for the header and highlights.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset) => {
                const active = Object.entries(preset.colors).every(([key, color]) => theme.colors[key as keyof typeof theme.colors] === color);
                return (
                  <Button key={preset.id} type="button" variant={active ? "secondary" : "outline"} size="sm" onClick={() => setTheme({ colors: preset.colors })}>
                    <span className="flex -space-x-1" aria-hidden>
                      <span className="size-3.5 rounded-full border border-background" style={{ backgroundColor: preset.colors.primary }} />
                      <span className="size-3.5 rounded-full border border-background" style={{ backgroundColor: preset.colors.accent }} />
                    </span>
                    {preset.name}
                  </Button>
                );
              })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField label="Primary" value={theme.colors.primary} onChange={setColor("primary")} error={errors["theme.colors.primary"]} />
              <ColorField
                label="Text on primary"
                value={theme.colors.onPrimary}
                onChange={setColor("onPrimary")}
                error={errors["theme.colors.onPrimary"]}
                contrastWith={{ color: theme.colors.primary, label: "the primary colour" }}
              />
              <ColorField label="Accent" value={theme.colors.accent} onChange={setColor("accent")} error={errors["theme.colors.accent"]} />
              <ColorField
                label="Text on accent"
                value={theme.colors.onAccent}
                onChange={setColor("onAccent")}
                error={errors["theme.colors.onAccent"]}
                contrastWith={{ color: theme.colors.accent, label: "the accent colour" }}
              />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Style</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={Boolean(errors["theme.radius"])}>
              <FieldLabel htmlFor="appearance-radius">Corner radius: {theme.radius}px</FieldLabel>
              <input
                id="appearance-radius"
                type="range"
                min={0}
                max={24}
                step={1}
                value={theme.radius}
                onChange={(event) => setTheme({ radius: Number(event.target.value) })}
                className="w-full accent-primary"
              />
              <FieldError>{errors["theme.radius"]}</FieldError>
            </Field>
            <Field>
              <FieldLabel>Cards</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {CARD_STYLES.map((style) => (
                  <button
                    key={style.value}
                    type="button"
                    onClick={() => setTheme({ cardStyle: style.value })}
                    aria-pressed={theme.cardStyle === style.value}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-lg border p-3 text-xs transition-colors hover:bg-muted/50",
                      theme.cardStyle === style.value && "border-primary ring-1 ring-primary",
                    )}
                  >
                    <span
                      className={cn(
                        "h-8 w-12 rounded-md bg-background",
                        style.value === "outlined" && "border",
                        style.value === "elevated" && "shadow-md",
                        style.value === "flat" && "bg-muted",
                      )}
                      aria-hidden
                    />
                    {style.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="appearance-scheme">Light or dark</FieldLabel>
              <Select value={theme.colorScheme} onValueChange={(scheme) => setTheme({ colorScheme: scheme as AppearanceTheme["colorScheme"] })}>
                <SelectTrigger id="appearance-scheme" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_SCHEMES.map((scheme) => (
                    <SelectItem key={scheme.value} value={scheme.value}>
                      {scheme.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Announcement bar</CardTitle>
          <CardDescription>A short line under the header, e.g. delivery time or a festival message.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <Switch id="announcement-enabled" checked={announcement.enabled} onCheckedChange={(enabled) => setAnnouncement({ enabled })} />
              <FieldLabel htmlFor="announcement-enabled">Show the announcement</FieldLabel>
            </Field>
            <Field data-invalid={Boolean(errors["announcement.text"])}>
              <FieldLabel htmlFor="announcement-text">Text</FieldLabel>
              <Input
                id="announcement-text"
                value={announcement.text}
                maxLength={80}
                placeholder="Groceries delivered in minutes"
                onChange={(event) => setAnnouncement({ text: event.target.value })}
                aria-invalid={Boolean(errors["announcement.text"])}
              />
              <FieldError>{errors["announcement.text"]}</FieldError>
            </Field>
            <Field orientation="horizontal">
              <Switch
                id="announcement-custom"
                checked={customAnnouncementColors}
                onCheckedChange={(custom) =>
                  setAnnouncement(custom ? { backgroundColor: theme.colors.primary, textColor: theme.colors.onPrimary } : { backgroundColor: null, textColor: null })
                }
              />
              <FieldLabel htmlFor="announcement-custom">Use custom colours (otherwise the primary colours)</FieldLabel>
            </Field>
            {customAnnouncementColors && (
              <div className="grid gap-4 sm:grid-cols-2">
                <ColorField
                  label="Background"
                  value={announcement.backgroundColor ?? ""}
                  onChange={(backgroundColor) => setAnnouncement({ backgroundColor })}
                  error={errors["announcement.backgroundColor"]}
                />
                <ColorField
                  label="Text"
                  value={announcement.textColor ?? ""}
                  onChange={(textColor) => setAnnouncement({ textColor })}
                  error={errors["announcement.textColor"]}
                  contrastWith={announcement.backgroundColor ? { color: announcement.backgroundColor, label: "the background" } : undefined}
                />
              </div>
            )}
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
