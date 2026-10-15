"use client";

import { useActionState, type ReactNode } from "react";

import type { FormState } from "@/lib/actions";
import { cn } from "@/lib/utils";

export const fieldClass =
  "h-11 w-full rounded-xl border bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

export function ActionForm({
  action,
  children,
  className,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className={className}>
      {state.error && (
        <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <fieldset disabled={pending} className={cn("min-w-0", pending && "opacity-70")}>
        {children}
      </fieldset>
    </form>
  );
}

export function SubmitButton({ children, className, disabled }: { children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button type="submit" disabled={disabled} className={cn("inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60", className)}>
      {children}
    </button>
  );
}
