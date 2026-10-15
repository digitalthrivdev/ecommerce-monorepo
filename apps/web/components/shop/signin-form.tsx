"use client";

import { useActionState } from "react";

import { signIn, type SignInState } from "@/lib/actions";
import { fieldClass, SubmitButton } from "./action-form";

export function SignInForm({ next }: { next: string }) {
  const initial: SignInState = { error: null, step: "phone", phone: "" };
  const [state, action, pending] = useActionState(signIn, initial);
  return <><form action={action} className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm"><input type="hidden" name="next" value={next}/><input type="hidden" name="step" value={state.step}/><label className="grid gap-1 text-sm font-medium">Phone number<input className={fieldClass} name="phone" type="tel" required autoComplete="tel" defaultValue={state.phone} placeholder="+91 98765 43210" readOnly={state.step === "otp"}/></label>{state.step === "otp" && <label className="grid gap-1 text-sm font-medium">One-time code<input className={fieldClass} name="otp" inputMode="numeric" autoComplete="one-time-code" required minLength={4} maxLength={8}/></label>}{state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.step === "otp" && <p className="text-sm text-muted-foreground">Enter the code sent to your phone.</p>}<SubmitButton disabled={pending}>{pending ? "Please wait…" : state.step === "otp" ? "Verify and sign in" : "Send code"}</SubmitButton></form>{state.step === "otp" && <form action={action} className="mt-3 text-center"><input type="hidden" name="next" value={next}/><input type="hidden" name="step" value="phone"/><input type="hidden" name="phone" value={state.phone}/><button className="text-sm underline">Send a new code</button></form>}</>;
}
