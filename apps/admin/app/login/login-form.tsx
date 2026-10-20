"use client";

import { useActionState, useRef, useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { DemoDashboardLogin } from "@/lib/types";

import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

type DemoLogin = DemoDashboardLogin & { label: string };

export function LoginForm({ next, initialError, demoLogins = [] }: { next?: string; initialError?: string; demoLogins?: DemoLogin[] }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const error = state === initialState ? initialError : state.error;
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function signInAs(login: DemoLogin) {
    if (!emailRef.current || !passwordRef.current) return;
    emailRef.current.value = login.email;
    passwordRef.current.value = login.password;
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="next" value={next ?? ""} />

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors?.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            defaultValue={state.email}
            aria-invalid={Boolean(state.fieldErrors?.email)}
            autoFocus
            required
          />
          <FieldError>{state.fieldErrors?.email}</FieldError>
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors?.password)}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <div className="relative">
            <Input
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              aria-invalid={Boolean(state.fieldErrors?.password)}
              className="pr-10"
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          <FieldDescription>Forgot it? Ask an admin to reset it.</FieldDescription>
          <FieldError>{state.fieldErrors?.password}</FieldError>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Sign in
        </Button>
      </FieldGroup>

      {demoLogins.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium">Try the demo</p>
          {demoLogins.map((login) => (
            <div key={login.email} className="flex flex-col gap-1.5">
              <Button type="button" variant="outline" disabled={pending} onClick={() => signInAs(login)}>
                Sign in as {login.label.toLowerCase()}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {login.email} · {login.password}
              </p>
            </div>
          ))}
        </div>
      )}
    </form>
  );
}
