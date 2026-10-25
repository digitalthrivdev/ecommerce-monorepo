"use client";

import { Loader2 } from "lucide-react";

import { removeCarrierKeys, saveCarrierKeys, updateShippingCarrier } from "@/app/(dashboard)/settings/actions";
import { Pill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldSet, FieldTitle } from "@/components/ui/field";
import { useFormAction } from "@/hooks/use-form-action";
import { activeCarrierOf, MANUAL_CARRIER, type PlatformSettings, type ShippingCarrierOption } from "@/lib/types";

import { WebhookSetup } from "./gateway-keys";
import { IntegrationKeysList } from "./integration-keys";

function describe(carrier: ShippingCarrierOption) {
  if (carrier.name === MANUAL_CARRIER) {
    return "Book the courier yourself and enter its name and AWB number when you ship. Tracking is updated by hand.";
  }
  if (!carrier.needsCredentials) return "Pretend shipments for trying things out. Not available on the live site.";
  if (carrier.configured) return carrier.source === "env" ? "Keys set on the server." : "Keys added in step 1.";
  return carrier.editable ? "Add its keys in step 1 first." : "Not set up on the server.";
}

function badge(carrier: ShippingCarrierOption) {
  if (carrier.name === MANUAL_CARRIER) return null;
  if (!carrier.configured) return <Pill tone="gray">No keys</Pill>;
  return carrier.testMode ? <Pill tone="amber">Test</Pill> : <Pill tone="green">Live</Pill>;
}

export function ShippingCarrierForm({ settings }: { settings: Pick<PlatformSettings, "shippingProvider" | "shippingCarriers" | "autoPushShipment"> }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(updateShippingCarrier);
  const carriers = settings.shippingCarriers;
  const active = activeCarrierOf(settings);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FieldSet>
        <div className="flex flex-col gap-3" role="radiogroup" aria-label="Shipping carrier">
          {carriers.map((carrier) => (
            <FieldLabel
              key={carrier.name}
              htmlFor={`carrier-${carrier.name}`}
              className="cursor-pointer has-checked:border-primary has-checked:bg-primary-soft"
            >
              <Field orientation="horizontal" data-disabled={!carrier.configured}>
                <FieldContent>
                  <FieldTitle>
                    {carrier.label}
                    {badge(carrier)}
                  </FieldTitle>
                  <FieldDescription>{describe(carrier)}</FieldDescription>
                </FieldContent>
                <input
                  type="radio"
                  id={`carrier-${carrier.name}`}
                  name="shippingProvider"
                  value={carrier.name}
                  defaultChecked={carrier.name === active?.name}
                  disabled={!carrier.configured}
                  className="size-5 accent-primary"
                />
              </Field>
            </FieldLabel>
          ))}
        </div>
        <FieldError>{fieldErrors.shippingProvider}</FieldError>
      </FieldSet>

      <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            name="autoPushShipment"
            defaultChecked={settings.autoPushShipment}
            className="mt-0.5 size-4 rounded accent-primary cursor-pointer"
          />
          <div>
            <span className="text-sm font-semibold">Automatically push orders to carrier</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              When enabled and a carrier (such as Shiprocket) is selected, newly confirmed orders are automatically packed and pushed to the carrier without having to manually ship each order.
            </p>
          </div>
        </label>
      </div>

      <p className="text-sm text-muted-foreground">
        Switching is safe: orders already shipped keep the carrier they were booked with.
      </p>

      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save choice
        </Button>
      </div>
    </form>
  );
}

function status(carrier: ShippingCarrierOption) {
  if (carrier.source === "env") return <Pill tone="blue">Set on server</Pill>;
  if (carrier.configured) return carrier.testMode ? <Pill tone="amber">Test</Pill> : <Pill tone="green">Live keys</Pill>;
  if (carrier.savedKeysUnreadable) return <Pill tone="red">Enter keys again</Pill>;
  return <Pill tone="gray">Not added</Pill>;
}

export function CarrierKeys({
  carriers,
  activeCarrier,
  canStore,
  timezone,
}: {
  carriers: ShippingCarrierOption[];
  activeCarrier: string;
  canStore: boolean;
  timezone: string;
}) {
  return (
    <IntegrationKeysList
      items={carriers.filter((carrier) => carrier.needsCredentials)}
      active={activeCarrier}
      canStore={canStore}
      timezone={timezone}
      save={saveCarrierKeys}
      remove={removeCarrierKeys}
      status={status}
      dialogExtra={(carrier) => <WebhookSetup gateway={carrier} title="Tracking updates" />}
      removeWarning={(carrier) =>
        `Shipments booked with ${carrier.label} can no longer be tracked, cancelled or relabelled until the keys are added again.`
      }
    />
  );
}
