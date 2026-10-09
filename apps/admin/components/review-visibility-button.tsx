"use client";

import { useTransition } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { setReviewHidden } from "@/app/(dashboard)/reviews/actions";
import { Button } from "@/components/ui/button";
import { toastResult } from "@/lib/action-toast";

export function ReviewVisibilityButton({ id, isHidden }: { id: string; isHidden: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(async () => void toastResult(await setReviewHidden(id, !isHidden)))}>
      {pending ? <Loader2 className="animate-spin" /> : isHidden ? <Eye /> : <EyeOff />}
      {isHidden ? "Show" : "Hide"}
    </Button>
  );
}
