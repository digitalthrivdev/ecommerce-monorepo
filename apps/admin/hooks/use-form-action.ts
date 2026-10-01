"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/types";

/**
 * Submits a form to a Server Action that takes FormData. Success shows a toast and calls
 * `onSuccess`; validation errors stay on the fields, other errors show a toast.
 */
export function useFormAction(action: (formData: FormData) => Promise<ActionResult>, onSuccess?: () => void) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const next = await action(formData);
      setResult(next);
      if (next.ok) {
        toast.success(next.message);
        onSuccess?.();
      } else if (!next.fieldErrors) {
        toast.error(next.error);
      }
    });
  }

  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  return { pending, fieldErrors, onSubmit, reset: () => setResult(null) };
}
