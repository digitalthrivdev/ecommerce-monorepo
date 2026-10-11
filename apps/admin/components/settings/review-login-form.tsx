"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { saveReviewLogin, saveRiderReviewLogin } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useFormAction } from "@/hooks/use-form-action";
import type { ReviewLogin } from "@/lib/types";

const COPY = {
  customer: {
    action: saveReviewLogin,
    phoneHint: "A number no real customer, staff member or rider uses.",
    note: "No SMS is sent to this number; the code above works instead. Orders from it are marked “Review account” so stores can cancel them. Turn this off once your app and payment account are approved.",
    save: "Save review login",
  },
  rider: {
    action: saveRiderReviewLogin,
    phoneHint: "Add it under Delivery partners first, as a rider only reviewers use.",
    note: "No SMS is sent to this number; the code above signs in to that rider's account in the delivery app. Turn this off once the delivery app is approved.",
    save: "Save rider review login",
  },
};

export function ReviewLoginForm({ app, reviewLogin }: { app: "customer" | "rider"; reviewLogin: ReviewLogin }) {
  const copy = COPY[app];
  const { pending, fieldErrors, onSubmit } = useFormAction(copy.action);
  const [enabled, setEnabled] = useState(reviewLogin.enabled);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field orientation="horizontal">
        <Switch id={`${app}-review-enabled`} name="enabled" checked={enabled} onCheckedChange={setEnabled} />
        <FieldLabel htmlFor={`${app}-review-enabled`}>Let reviewers sign in with a fixed code</FieldLabel>
      </Field>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(fieldErrors.phone)}>
            <FieldLabel htmlFor={`${app}-review-phone`}>Phone number</FieldLabel>
            <Input
              id={`${app}-review-phone`}
              name="phone"
              type="tel"
              defaultValue={reviewLogin.phone ?? ""}
              placeholder="+919000000001"
              aria-invalid={Boolean(fieldErrors.phone)}
            />
            <FieldDescription>{copy.phoneHint}</FieldDescription>
            <FieldError>{fieldErrors.phone}</FieldError>
          </Field>
          <Field data-invalid={Boolean(fieldErrors.code)}>
            <FieldLabel htmlFor={`${app}-review-code`}>Code</FieldLabel>
            <Input
              id={`${app}-review-code`}
              name="code"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              placeholder={reviewLogin.codeSet ? "Saved, leave blank to keep" : "6 digits"}
              aria-invalid={Boolean(fieldErrors.code)}
            />
            <FieldDescription>Stored safely and not shown again, so note it down.</FieldDescription>
            <FieldError>{fieldErrors.code}</FieldError>
          </Field>
        </div>
      </FieldGroup>
      <p className="text-sm text-muted-foreground">{copy.note}</p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {copy.save}
        </Button>
      </div>
    </form>
  );
}
