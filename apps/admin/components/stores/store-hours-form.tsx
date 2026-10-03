"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { saveStoreHours } from "@/app/(dashboard)/stores/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toastResult } from "@/lib/action-toast";
import { WEEKDAY_LABELS } from "@/lib/format";
import type { StoreHours } from "@/lib/types";

/** Monday first, as shops usually list them. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Day = { open: boolean; opensAt: string; closesAt: string };

function initialDays(hours: StoreHours[]): Day[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const entry = hours.find((candidate) => candidate.dayOfWeek === dayOfWeek);
    return entry
      ? { open: true, opensAt: entry.opensAt, closesAt: entry.closesAt }
      : { open: hours.length === 0, opensAt: "07:00", closesAt: "23:00" };
  });
}

/**
 * Weekly hours in the deployment's time zone. Customers cannot check out while the store is
 * closed. Closing earlier than opening means the store stays open past midnight.
 */
export function StoreHoursForm({ storeId, hours, timezone }: { storeId: string; hours: StoreHours[]; timezone: string }) {
  const [alwaysOpen, setAlwaysOpen] = useState(hours.length === 0);
  const [days, setDays] = useState(() => initialDays(hours));
  const [pending, startTransition] = useTransition();

  const update = (dayOfWeek: number, changes: Partial<Day>) =>
    setDays(days.map((day, index) => (index === dayOfWeek ? { ...day, ...changes } : day)));

  const sameTimes = days.some((day) => day.open && day.opensAt === day.closesAt);
  const noOpenDays = !alwaysOpen && days.every((day) => !day.open);

  function save() {
    const entries = alwaysOpen
      ? []
      : days.flatMap((day, dayOfWeek) => (day.open ? [{ dayOfWeek, opensAt: day.opensAt, closesAt: day.closesAt }] : []));
    startTransition(async () => void toastResult(await saveStoreHours({ storeId, hours: entries })));
  }

  return (
    <div className="flex flex-col gap-4">
      <Field orientation="horizontal">
        <Switch id="store-always-open" checked={alwaysOpen} onCheckedChange={setAlwaysOpen} />
        <FieldLabel htmlFor="store-always-open">Open 24 hours, every day</FieldLabel>
      </Field>

      {!alwaysOpen && (
        <div className="flex flex-col gap-2">
          {DAY_ORDER.map((dayOfWeek) => {
            const day = days[dayOfWeek]!;
            const overnight = day.open && day.closesAt < day.opensAt;
            return (
              <div key={dayOfWeek} className="flex flex-wrap items-center gap-3">
                <Switch checked={day.open} onCheckedChange={(open) => update(dayOfWeek, { open })} aria-label={`Open on ${WEEKDAY_LABELS[dayOfWeek]}`} />
                <span className="w-24 text-sm">{WEEKDAY_LABELS[dayOfWeek]}</span>
                {day.open ? (
                  <>
                    <Input
                      type="time"
                      value={day.opensAt}
                      onChange={(event) => update(dayOfWeek, { opensAt: event.target.value })}
                      aria-label={`${WEEKDAY_LABELS[dayOfWeek]} opens at`}
                      className="w-28"
                      required
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={day.closesAt}
                      onChange={(event) => update(dayOfWeek, { closesAt: event.target.value })}
                      aria-label={`${WEEKDAY_LABELS[dayOfWeek]} closes at`}
                      className="w-28"
                      aria-invalid={day.opensAt === day.closesAt}
                      required
                    />
                    {overnight && <span className="text-xs text-muted-foreground">next day</span>}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">Closed</span>
                )}
              </div>
            );
          })}
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() => setDays(days.map(() => ({ ...days[1]! })))}
            >
              Copy Monday to every day
            </Button>
          </div>
        </div>
      )}

      <FieldDescription>
        Times are in {timezone}. Customers cannot place orders while the store is closed.
        {sameTimes && " Opening and closing times must differ."}
        {noOpenDays && " Turn on at least one day, or choose open 24 hours."}
      </FieldDescription>

      <div>
        <Button type="button" disabled={pending || sameTimes || noOpenDays} onClick={save}>
          {pending && <Loader2 className="animate-spin" />}
          Save hours
        </Button>
      </div>
    </div>
  );
}
