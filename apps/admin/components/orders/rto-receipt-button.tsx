"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";

import { confirmRtoReceipt } from "@/app/(dashboard)/orders/actions";
import { toastResult } from "@/lib/action-toast";
import { Button } from "@/components/ui/button";

export function RtoReceiptButton({ orderId, alreadyReceived }: { orderId: string; alreadyReceived: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button disabled={pending || alreadyReceived} variant="outline" onClick={() => {
      if (!window.confirm("Confirm the RTO parcel is back? This restores stock and refunds any paid online order.")) return;
      startTransition(async () => { toastResult(await confirmRtoReceipt({ orderId })); });
    }}>
      {pending && <Loader2 className="animate-spin" />}
      {alreadyReceived ? "RTO received" : "Confirm RTO received"}
    </Button>
  );
}
