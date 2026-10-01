"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { step: "phone" };

export function LoginForm({ next, initialError, showDevHint }: { next?: string; initialError?: string; showDevHint: boolean }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const error = state === initialState ? initialError : state.error;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="next" value={next ?? ""} />

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {state.step === "phone" ? (
        <FieldGroup>
          <Field data-invalid={Boolean(state.fieldErrors?.phone)}>
            <FieldLabel htmlFor="phone">Phone number</FieldLabel>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              defaultValue={state.phone ?? "+91"}
              aria-invalid={Boolean(state.fieldErrors?.phone)}
              autoFocus
              required
            />
            <FieldDescription>Include the country code.</FieldDescription>
            <FieldError>{state.fieldErrors?.phone}</FieldError>
          </Field>
          <Button type="submit" name="intent" value="send" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Send code
          </Button>
        </FieldGroup>
      ) : (
        <FieldGroup>
          <input type="hidden" name="phone" value={state.phone ?? ""} />
          <Field data-invalid={Boolean(state.fieldErrors?.otp)}>
            <FieldLabel htmlFor="otp">Verification code</FieldLabel>
            <Input
              key={state.phone}
              id="otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              placeholder="6-digit code"
              aria-invalid={Boolean(state.fieldErrors?.otp)}
              autoFocus
              required
            />
            <FieldDescription>
              {state.message ?? `Enter the code sent to ${state.phone}.`}
              {showDevHint && " In development the code is printed in the API server log."}
            </FieldDescription>
            <FieldError>{state.fieldErrors?.otp}</FieldError>
          </Field>
          <Button type="submit" name="intent" value="verify" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Sign in
          </Button>
          <div className="flex justify-between">
            <Button type="submit" name="intent" value="change-phone" variant="link" size="sm" formNoValidate disabled={pending} className="px-0">
              Change number
            </Button>
            <Button type="submit" name="intent" value="resend" variant="link" size="sm" formNoValidate disabled={pending} className="px-0">
              Resend code
            </Button>
          </div>
        </FieldGroup>
      )}
    </form>
  );
}
