"use client";

import { useActionState } from "react";

import { checkPincode } from "@/lib/actions";
import { SubmitButton, fieldClass } from "./action-form";

export function PincodeCheck() {
  const [state, action, pending] = useActionState(checkPincode, { error: null, result: null });
  return <form action={action} className="grid gap-2 rounded-2xl border p-4"><label htmlFor="pincode" className="text-sm font-semibold">Check delivery to your pincode</label><div className="flex gap-2"><input id="pincode" name="pincode" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="6-digit pincode" className={fieldClass}/><SubmitButton disabled={pending}>{pending ? "Checking…" : "Check"}</SubmitButton></div>{state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}{state.result && <p role="status" className="text-sm">{state.result.serviceable ? `Delivery available${state.result.etaDays ? ` in about ${state.result.etaDays} days` : ""}. ${state.result.codAvailable ? "Cash on delivery is available." : "Cash on delivery is not available."}` : "Delivery is not available at this pincode."}</p>}</form>;
}
