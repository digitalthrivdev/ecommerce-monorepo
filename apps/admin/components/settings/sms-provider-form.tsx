"use client";

import { Loader2 } from "lucide-react";

import { removeOtpProviderKeys, saveOtpProviderKeys, updateOtpProvider } from "@/app/(dashboard)/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldSet, FieldTitle } from "@/components/ui/field";
import { useFormAction } from "@/hooks/use-form-action";
import type { SmsSettings } from "@/lib/types";

import { IntegrationKeysList } from "./integration-keys";

type Option = { value: string; title: string; description: string; badge?: React.ReactNode; disabled?: boolean };

export function SmsProviderForm({ sms }: { sms: SmsSettings }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(updateOtpProvider);
  const locked = sms.environmentOverride !== null;
  const selected = sms.providers.find((provider) => provider.name === sms.selected);

  const options: Option[] = [
    ...sms.providers.map((provider) => ({
      value: provider.name,
      title: provider.label,
      description: provider.configured
        ? provider.source === "env"
          ? "Keys set in the server environment."
          : "Keys saved under SMS provider keys."
        : provider.editable
          ? "Add its keys under SMS provider keys first."
          : "Not configured on the server.",
      badge: provider.configured ? <Badge>Ready</Badge> : <Badge variant="outline">Not configured</Badge>,
      disabled: locked || !provider.configured,
    })),
    {
      value: "",
      title: "None",
      description:
        sms.fallback === "nobody"
          ? "No SMS is sent, so customers and delivery partners cannot sign in."
          : "Codes are written to the API log instead of being sent. Fine for development.",
      disabled: locked,
    },
  ];

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {locked ? (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">
          OTP_PROVIDER={sms.environmentOverride} is set in the server environment, so the choice below is ignored.
          Remove it there to choose here.
        </p>
      ) : (
        !sms.active &&
        sms.fallback === "nobody" && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {sms.selected && !selected?.configured
              ? `The selected provider (${selected?.label ?? sms.selected}) has no working keys, so customers cannot sign in.`
              : "No SMS provider is set up, so customers cannot sign in."}{" "}
            Add keys and choose a provider.
          </p>
        )
      )}

      <FieldSet>
        <div className="flex flex-col gap-3" role="radiogroup" aria-label="SMS provider">
          {options.map((option) => (
            <FieldLabel
              key={option.value || "none"}
              htmlFor={`sms-${option.value || "none"}`}
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
                  id={`sms-${option.value || "none"}`}
                  name="otpProvider"
                  value={option.value}
                  defaultChecked={option.value === (selected?.configured ? sms.selected : "")}
                  disabled={option.disabled}
                  className="size-4 accent-primary"
                />
              </Field>
            </FieldLabel>
          ))}
        </div>
        <FieldError>{fieldErrors.otpProvider}</FieldError>
      </FieldSet>

      <p className="text-sm text-muted-foreground">
        Codes already sent can still be used after a switch, as long as the old provider keeps its keys.
      </p>

      <div>
        <Button type="submit" disabled={pending || locked}>
          {pending && <Loader2 className="animate-spin" />}
          Save SMS provider
        </Button>
      </div>
    </form>
  );
}

export function SmsProviderKeys({ sms, canStore, timezone }: { sms: SmsSettings; canStore: boolean; timezone: string }) {
  return (
    <IntegrationKeysList
      items={sms.providers}
      active={sms.selected}
      canStore={canStore}
      timezone={timezone}
      save={saveOtpProviderKeys}
      remove={removeOtpProviderKeys}
      removeWarning={(provider) => `Codes can no longer be sent through ${provider.label} until the keys are added again.`}
    />
  );
}
