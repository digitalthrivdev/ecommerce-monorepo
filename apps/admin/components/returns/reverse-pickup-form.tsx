"use client";

import { saveReversePickup } from "@/app/(dashboard)/returns/actions";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFormAction } from "@/hooks/use-form-action";

export function ReversePickupForm({ complaintId, courierName, awb, trackingUrl }: { complaintId: string; courierName: string | null; awb: string | null; trackingUrl: string | null }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(saveReversePickup);
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="complaintId" value={complaintId} />
      <div><Input name="courierName" required maxLength={100} defaultValue={courierName ?? ""} placeholder="Courier name" aria-label="Courier name" /><FieldError>{fieldErrors.courierName}</FieldError></div>
      <div><Input name="awb" required maxLength={100} defaultValue={awb ?? ""} placeholder="Reverse AWB" aria-label="Reverse AWB" /><FieldError>{fieldErrors.awb}</FieldError></div>
      <div><Input name="trackingUrl" type="url" maxLength={500} defaultValue={trackingUrl ?? ""} placeholder="Tracking URL (optional)" aria-label="Tracking URL" /><FieldError>{fieldErrors.trackingUrl}</FieldError></div>
      <Button type="submit" variant="outline" disabled={pending} className="sm:col-span-3 sm:w-fit">Save pickup details</Button>
    </form>
  );
}
