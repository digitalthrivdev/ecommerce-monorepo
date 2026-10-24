"use client";

import { useActionState } from "react";

import { checkPincode } from "@/lib/actions";
import { SubmitButton, fieldClass } from "./action-form";

function formatEstimatedDelivery(etaDays: number | null): string {
  if (etaDays && etaDays > 0) {
    const target = new Date(Date.now() + etaDays * 86_400_000);
    const formatted = target.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    return `Estimated delivery by ${formatted} (${etaDays} ${etaDays === 1 ? "day" : "days"})`;
  }
  return "Standard delivery available (typically 3–5 business days)";
}

export function PincodeCheck() {
  const [state, action, pending] = useActionState(checkPincode, { error: null, result: null });
  return (
    <form action={action} className="grid gap-2 rounded-2xl border p-4">
      <label htmlFor="pincode" className="text-sm font-semibold">
        Check delivery to your pincode
      </label>
      <div className="flex gap-2">
        <input
          id="pincode"
          name="pincode"
          required
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          placeholder="6-digit pincode"
          className={fieldClass}
        />
        <SubmitButton disabled={pending}>{pending ? "Checking…" : "Check"}</SubmitButton>
      </div>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.result && (
        <div role="status" className="mt-1 space-y-1 text-sm">
          {state.result.serviceable ? (
            <>
              <p className="font-medium text-emerald-700">✓ {formatEstimatedDelivery(state.result.etaDays)}</p>
              <p className="text-xs text-muted-foreground">
                {state.result.codAvailable ? "Cash on delivery is available." : "Cash on delivery not available (Online payment only)."}
              </p>
            </>
          ) : (
            <p className="text-sm font-medium text-red-700">Delivery is not available to this pincode.</p>
          )}
        </div>
      )}
    </form>
  );
}
