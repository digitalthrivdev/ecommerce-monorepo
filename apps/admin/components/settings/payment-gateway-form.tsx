"use client";

import { Loader2 } from "lucide-react";

import { updatePaymentGateway } from "@/app/(dashboard)/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldSet, FieldTitle } from "@/components/ui/field";
import { useFormAction } from "@/hooks/use-form-action";
import type { PlatformSettings } from "@/lib/types";

type Option = { value: string; title: string; description: string; badge?: React.ReactNode; disabled?: boolean };

export function PaymentGatewayForm({ settings }: { settings: PlatformSettings }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(updatePaymentGateway);
  const active = settings.paymentGateways.find((gateway) => gateway.name === settings.paymentProvider);

  const options: Option[] = [
    ...settings.paymentGateways.map((gateway) => ({
      value: gateway.name,
      title: gateway.label,
      description: !gateway.needsCredentials
        ? "Charges nothing. Only available outside production."
        : gateway.configured
          ? gateway.source === "env"
            ? "Keys set in the server environment."
            : "Keys saved under Gateway keys."
          : gateway.editable
            ? "Add its keys under Gateway keys first."
            : "Not configured on the server.",
      badge: gateway.configured ? (
        gateway.testMode ? <Badge variant="secondary">Test mode</Badge> : <Badge>Live</Badge>
      ) : (
        <Badge variant="outline">Not configured</Badge>
      ),
      disabled: !gateway.configured,
    })),
    { value: "", title: "Off", description: "Customers can only pay cash on delivery." },
  ];

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {settings.paymentProvider && !active?.configured && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          The selected gateway ({active?.label ?? settings.paymentProvider}) has no working keys, so online payments
          are off. Choose another gateway or add its keys again.
        </p>
      )}

      <FieldSet>
        <div className="flex flex-col gap-3" role="radiogroup" aria-label="Payment gateway">
          {options.map((option) => (
            <FieldLabel
              key={option.value || "off"}
              htmlFor={`gateway-${option.value || "off"}`}
              className="has-checked:border-primary/30 has-checked:bg-primary/5 dark:has-checked:border-primary/20 dark:has-checked:bg-primary/10"
            >
              <Field orientation="horizontal" data-disabled={option.disabled}>
                <FieldContent>
                  <FieldTitle>
                    {option.title}
                    {option.badge}
                  </FieldTitle>
                  <FieldDescription>{option.description}</FieldDescription>
                </FieldContent>
                <input
                  type="radio"
                  id={`gateway-${option.value || "off"}`}
                  name="paymentProvider"
                  value={option.value}
                  defaultChecked={option.value === (active?.configured ? settings.paymentProvider : "")}
                  disabled={option.disabled}
                  className="size-4 accent-primary"
                />
              </Field>
            </FieldLabel>
          ))}
        </div>
        <FieldError>{fieldErrors.paymentProvider}</FieldError>
      </FieldSet>

      <p className="text-sm text-muted-foreground">
        Payments already started stay on the gateway they began with, including their refunds.
      </p>

      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save online payments
        </Button>
      </div>
    </form>
  );
}
