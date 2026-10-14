"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { saveReviewLogin } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useFormAction } from "@/hooks/use-form-action";
import type { ReviewLogin } from "@/lib/types";

export function ReviewLoginForm({ reviewLogin }: { reviewLogin: ReviewLogin }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(saveReviewLogin);
  const [enabled, setEnabled] = useState(reviewLogin.enabled);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field orientation="horizontal">
        <Switch id={"review-enabled"} name="enabled" checked={enabled} onCheckedChange={setEnabled} />
        <FieldLabel htmlFor={"review-enabled"}>Let reviewers sign in with a fixed code</FieldLabel>
      </Field>
      <FieldGroup>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(fieldErrors.phone)}>
            <FieldLabel htmlFor={"review-phone"}>Phone number</FieldLabel>
            <Input
              id={"review-phone"}
              name="phone"
              type="tel"
              defaultValue={reviewLogin.phone ?? ""}
              placeholder="+919000000001"
              aria-invalid={Boolean(fieldErrors.phone)}
            />
            <FieldDescription>A number no real customer or staff member uses.</FieldDescription>
            <FieldError>{fieldErrors.phone}</FieldError>
          </Field>
          <Field data-invalid={Boolean(fieldErrors.code)}>
            <FieldLabel htmlFor={"review-code"}>Code</FieldLabel>
            <Input
              id={"review-code"}
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
      <p className="text-sm text-muted-foreground">
        No SMS is sent to this number; the code above works instead. Orders from it are marked “Review account” so stores can
        cancel them. Turn this off once your app and payment account are approved.
      </p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save review login
        </Button>
      </div>
    </form>
  );
}
