"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { advanceOrder, assignPartner, cancelOrder, markItemUnavailable } from "@/app/(dashboard)/orders/actions";
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
import { toastResult } from "@/lib/action-toast";
import type { DeliveryPartner, OrderAction, StoreOrderAction } from "@/lib/types";

const ADVANCE_ACTIONS: readonly StoreOrderAction[] = ["accept", "start-picking", "pack", "ready"];

const isAdvance = (action: OrderAction): action is StoreOrderAction =>
  (ADVANCE_ACTIONS as readonly string[]).includes(action);

type Target = { storeId: string; orderId: string };

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
      onClick={() => startTransition(async () => void toastResult(await advanceOrder({ storeId, orderId, action })))}
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
      if (toastResult(await cancelOrder({ storeId, orderId, reason }))) {
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

/** Per-item action while picking: removes units the store cannot find from the order. */
export function MarkUnavailableDialog({ storeId, orderId, item }: Target & {
  item: { id: string; productName: string; quantity: number; unavailableQuantity: number };
}) {
  const remaining = item.quantity - item.unavailableQuantity;
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(remaining));
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      if (toastResult(await markItemUnavailable({ storeId, orderId, itemId: item.id, quantity: Number(quantity) }))) {
        setOpen(false);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuantity(String(remaining));
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {ORDER_ACTION_LABELS["mark-unavailable"]}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item.productName} unavailable?</DialogTitle>
          <DialogDescription>
            The units are removed from the bill. Online payments are refunded automatically and cash orders collect the
            lower total. The product&apos;s stock is set to 0. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {remaining > 1 && (
          <Field>
            <FieldLabel htmlFor="unavailable-quantity">How many are unavailable?</FieldLabel>
            <Select value={quantity} onValueChange={setQuantity}>
              <SelectTrigger id="unavailable-quantity" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: remaining }, (_, index) => remaining - index).map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {count === remaining ? `All ${count}` : `${count} of ${remaining}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Keep item</Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending} onClick={submit}>
            {pending && <Loader2 className="animate-spin" />}
            {ORDER_ACTION_LABELS["mark-unavailable"]}
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
      if (toastResult(await assignPartner({ storeId, orderId, partnerId, mode }))) {
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
