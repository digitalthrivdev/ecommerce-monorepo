"use client";

import { Loader2 } from "lucide-react";

import { updatePaymentGateway } from "@/app/(dashboard)/settings/actions";
import { Pill } from "@/components/status-pill";
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
        ? "Pretend payments for trying things out. Not available on the live site."
        : gateway.configured
          ? gateway.source === "env"
            ? "Keys set on the server."
            : "Keys added in step 1."
          : gateway.editable
            ? "Add its keys in step 1 first."
            : "Not set up on the server.",
      badge: gateway.configured ? (
        gateway.testMode ? <Pill tone="amber">Test mode</Pill> : <Pill tone="green">Live</Pill>
      ) : (
        <Pill tone="gray">No keys</Pill>
      ),
      disabled: !gateway.configured,
    })),
    { value: "", title: "Cash on delivery only", description: "Turn online payments off." },
  ];

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FieldSet>
        <div className="flex flex-col gap-3" role="radiogroup" aria-label="Payment gateway">
          {options.map((option) => (
            <FieldLabel
              key={option.value || "off"}
              htmlFor={`gateway-${option.value || "off"}`}
              className="cursor-pointer has-checked:border-primary has-checked:bg-primary-soft"
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
                  className="size-5 accent-primary"
                />
              </Field>
            </FieldLabel>
          ))}
        </div>
        <FieldError>{fieldErrors.paymentProvider}</FieldError>
      </FieldSet>

      <p className="text-sm text-muted-foreground">
        Switching is safe: payments already started finish, and can be refunded, on the one they began with.
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
