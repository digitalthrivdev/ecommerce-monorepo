"use client";

import { ChevronDown, Megaphone } from "lucide-react";

import { ColorField } from "@/components/appearance/color-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Appearance } from "@/lib/types";
import { cn } from "@/lib/utils";

export const ANNOUNCEMENT_ID = "announcement";

type AnnouncementEditorProps = {
  value: Appearance;
  onChange: (next: Appearance) => void;
  errors: Record<string, string>;
  expanded: string | null;
  onExpand: (id: string | null) => void;
};

/** The full-width line under the category tabs on the "All" screen. */
export function AnnouncementEditor({ value, onChange, errors, expanded, onExpand }: AnnouncementEditorProps) {
  const { theme, announcement } = value;
  const setAnnouncement = (patch: Partial<Appearance["announcement"]>) => onChange({ ...value, announcement: { ...announcement, ...patch } });
  const customColors = announcement.backgroundColor !== null;
  const hasErrors = Object.keys(errors).some((key) => key.startsWith(`${ANNOUNCEMENT_ID}.`));
  const open = announcement.enabled && (expanded === ANNOUNCEMENT_ID || hasErrors);

  return (
    <Card size="sm">
      <CardHeader>
        <button
          type="button"
          onClick={() => onExpand(open ? null : ANNOUNCEMENT_ID)}
          disabled={!announcement.enabled}
          className="flex min-w-0 items-center gap-3 text-left"
          aria-expanded={open}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
            <Megaphone className="size-4" />
          </span>
          <span className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              Announcement bar
              {hasErrors && <Badge variant="destructive">Needs attention</Badge>}
            </CardTitle>
            <CardDescription className="truncate">
              {announcement.enabled ? announcement.text || "No text yet" : "Hidden. Turn on to show a line under the category tabs."}
            </CardDescription>
          </span>
          {announcement.enabled && <ChevronDown className={cn("ml-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />}
        </button>
        <CardAction>
          <Switch
            checked={announcement.enabled}
            onCheckedChange={(enabled) => {
              setAnnouncement({ enabled });
              if (enabled) onExpand(ANNOUNCEMENT_ID);
            }}
            aria-label={announcement.enabled ? "Hide the announcement" : "Show the announcement"}
          />
        </CardAction>
      </CardHeader>
      {open && (
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">A full-width line under the category tabs on the &quot;All&quot; screen, e.g. delivery time or a festival message.</p>
          <FieldGroup>
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
                checked={customColors}
                onCheckedChange={(custom) =>
                  setAnnouncement(custom ? { backgroundColor: theme.colors.primary, textColor: theme.colors.onPrimary } : { backgroundColor: null, textColor: null })
                }
              />
              <FieldLabel htmlFor="announcement-custom">Use custom colours (otherwise the primary colours)</FieldLabel>
            </Field>
            {customColors && (
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
      )}
    </Card>
  );
}
