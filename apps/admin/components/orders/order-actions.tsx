"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { advanceOrder, assignPartner, cancelOrder, type ActionResult } from "@/app/(dashboard)/orders/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ORDER_ACTION_LABELS } from "@/lib/format";
import type { DeliveryPartner, OrderAction, StoreOrderAction } from "@/lib/types";

const ADVANCE_ACTIONS: readonly StoreOrderAction[] = ["accept", "start-picking", "pack", "ready"];

const isAdvance = (action: OrderAction): action is StoreOrderAction =>
  (ADVANCE_ACTIONS as readonly string[]).includes(action);

type Target = { storeId: string; orderId: string };

function report(result: ActionResult) {
  if (result.ok) {
    toast.success(result.message);
  } else {
    toast.error(result.error);
  }
  return result.ok;
}

/** The next store workflow step, used inline in the orders table. */
export function AdvanceOrderButton({ storeId, orderId, allowedActions, size = "sm" }: Target & {
  allowedActions: OrderAction[];
  size?: "sm" | "default";
}) {
  const [pending, startTransition] = useTransition();
  const action = allowedActions.find(isAdvance);
  if (!action) return null;

  return (
    <Button
      size={size}
      disabled={pending}
      onClick={() => startTransition(async () => void report(await advanceOrder({ storeId, orderId, action })))}
    >
      {pending && <Loader2 className="animate-spin" />}
      {ORDER_ACTION_LABELS[action]}
    </Button>
  );
}

function CancelOrderDialog({ storeId, orderId, orderNumber }: Target & { orderNumber: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      if (report(await cancelOrder({ storeId, orderId, reason }))) {
        setOpen(false);
        setReason("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">{ORDER_ACTION_LABELS.cancel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel order {orderNumber}?</DialogTitle>
          <DialogDescription>
            Stock is returned to the store and online payments are refunded automatically. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="cancel-reason">Reason</FieldLabel>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            placeholder="e.g. Customer requested cancellation"
          />
          <FieldDescription>Recorded in the order history.</FieldDescription>
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep order</Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending || reason.trim().length === 0} onClick={submit}>
            {pending && <Loader2 className="animate-spin" />}
            Cancel order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignPartnerDialog({ storeId, orderId, mode, partners }: Target & {
  mode: "assign" | "reassign";
  partners: DeliveryPartner[];
}) {
  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      if (report(await assignPartner({ storeId, orderId, partnerId, mode }))) {
        setOpen(false);
        setPartnerId("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={mode === "assign" ? "default" : "outline"}>{ORDER_ACTION_LABELS[mode]}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ORDER_ACTION_LABELS[mode]}</DialogTitle>
          <DialogDescription>
            {mode === "assign"
              ? "The partner gets the delivery in their app and can accept or decline it."
              : "The current partner is released and the delivery moves to the new partner."}
          </DialogDescription>
        </DialogHeader>
        {partners.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No delivery partners are online right now. Partners appear here when they go online in the delivery app.
          </p>
        ) : (
          <Field>
            <FieldLabel htmlFor="partner">Online partners</FieldLabel>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger id="partner" className="w-full">
                <SelectValue placeholder="Choose a delivery partner" />
              </SelectTrigger>
              <SelectContent>
                {partners.map((partner) => (
                  <SelectItem key={partner.id} value={partner.id}>
                    {partner.name ?? partner.phone}
                    {partner.vehicleNumber && ` · ${partner.vehicleNumber}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button disabled={pending || !partnerId} onClick={submit}>
            {pending && <Loader2 className="animate-spin" />}
            {ORDER_ACTION_LABELS[mode]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrderActions({ storeId, orderId, orderNumber, allowedActions, partners }: Target & {
  orderNumber: string;
  allowedActions: OrderAction[];
  partners: DeliveryPartner[] | null;
}) {
  const assignMode = allowedActions.includes("assign") ? "assign" : allowedActions.includes("reassign") ? "reassign" : null;

  return (
    <>
      {allowedActions.includes("cancel") && <CancelOrderDialog storeId={storeId} orderId={orderId} orderNumber={orderNumber} />}
      {assignMode && <AssignPartnerDialog storeId={storeId} orderId={orderId} mode={assignMode} partners={partners ?? []} />}
      <AdvanceOrderButton storeId={storeId} orderId={orderId} allowedActions={allowedActions} size="default" />
    </>
  );
}
