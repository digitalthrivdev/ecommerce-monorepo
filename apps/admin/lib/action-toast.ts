import { toast } from "sonner";

import type { ActionResult } from "./types";

/** Shows a Server Action result as a toast and returns whether it succeeded. */
export function toastResult(result: ActionResult) {
  if (result.ok) {
    toast.success(result.message);
  } else {
    toast.error(result.error);
  }
  return result.ok;
}
