"use client";

import { Loader2, Truck } from "lucide-react";

import { bookReversePickup } from "@/app/(dashboard)/returns/actions";
import { Button } from "@/components/ui/button";
import { useFormAction } from "@/hooks/use-form-action";

export function BookReversePickupButton({ complaintId }: { complaintId: string }) {
  const { pending, onSubmit } = useFormAction(bookReversePickup);
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="complaintId" value={complaintId} />
      <div className="flex flex-wrap items-start gap-2">
        <input name="email" type="email" required maxLength={200} placeholder="Customer email for courier pickup" aria-label="Customer email for courier pickup" className="h-9 rounded-md border bg-background px-3 text-sm" />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Truck />}
          Book Shiprocket reverse pickup
        </Button>
      </div>
    </form>
  );
}
