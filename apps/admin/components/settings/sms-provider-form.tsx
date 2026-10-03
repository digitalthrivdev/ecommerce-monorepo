"use client";

import { Loader2 } from "lucide-react";

import { removeOtpProviderKeys, saveOtpProviderKeys, updateOtpProvider } from "@/app/(dashboard)/settings/actions";
import { Pill } from "@/components/status-pill";
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
          ? "Details set on the server."
          : "Details added in step 1."
        : provider.editable
          ? "Add its details in step 1 first."
          : "Not set up on the server.",
      badge: provider.configured ? <Pill tone="green">Ready</Pill> : <Pill tone="gray">No details</Pill>,
      disabled: locked || !provider.configured,
    })),
    {
      value: "",
      title: "Don't send texts",
      description:
        sms.fallback === "nobody"
          ? "Nobody gets a code, so customers and riders cannot sign in."
          : "Codes go to the server log instead. Only for testing.",
      disabled: locked,
    },
  ];

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <FieldSet>
        <div className="flex flex-col gap-3" role="radiogroup" aria-label="SMS provider">
          {options.map((option) => (
            <FieldLabel
              key={option.value || "none"}
              htmlFor={`sms-${option.value || "none"}`}
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
                  id={`sms-${option.value || "none"}`}
                  name="otpProvider"
                  value={option.value}
                  defaultChecked={option.value === (selected?.configured ? sms.selected : "")}
                  disabled={option.disabled}
                  className="size-5 accent-primary"
                />
              </Field>
            </FieldLabel>
          ))}
        </div>
        <FieldError>{fieldErrors.otpProvider}</FieldError>
      </FieldSet>

      <p className="text-sm text-muted-foreground">
        Switching is safe: codes already sent still work.
      </p>

      <div>
        <Button type="submit" disabled={pending || locked}>
          {pending && <Loader2 className="animate-spin" />}
          Save choice
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
