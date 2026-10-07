"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Ban, Loader2, MoreHorizontal, Printer } from "lucide-react";

import { advanceOrder, assignPartner, cancelOrder, markItemUnavailable } from "@/app/(dashboard)/orders/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ORDER_ACTION_LABELS, productTitle } from "@/lib/format";
import { toastResult } from "@/lib/action-toast";
import { nextStep } from "@/lib/order-flow";
import { clearPackingTicks, usePackingTicks } from "@/lib/packing-ticks";
import type { DeliveryPartner, OrderAction, OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Target = { storeId: string; orderId: string };

/**
 * The one main button for the order's next step. With `packItemIds`, "Packed – ready" asks first
 * when some items on the checklist aren't ticked.
 */
export function NextStepButton({
  storeId,
  orderId,
  status,
  allowedActions,
  packItemIds,
  size = "lg",
  className,
}: Target & {
  status: OrderStatus;
  allowedActions: OrderAction[];
  packItemIds?: string[];
  size?: "default" | "lg";
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const { ticked } = usePackingTicks(orderId);
  const step = nextStep(status, allowedActions);
  if (!step) return null;

  const unticked = step.action === "pack-ready" && packItemIds ? packItemIds.filter((id) => !ticked.has(id)).length : 0;

  function go() {
    setConfirming(false);
    startTransition(async () => {
      if (toastResult(await advanceOrder({ storeId, orderId, action: step!.action })) && step!.action === "pack-ready") {
        clearPackingTicks(orderId);
      }
    });
  }

  return (
    <>
      <Button size={size} disabled={pending} className={className} onClick={() => (unticked > 0 ? setConfirming(true) : go())}>
        {pending && <Loader2 className="animate-spin" />}
        {step.label}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {unticked} {unticked === 1 ? "item isn't" : "items aren't"} ticked. Mark ready anyway?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tick each item as you put it in the bag. If something isn&apos;t on the shelf, use Item not found so the
              customer isn&apos;t charged for it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={go}>Mark ready</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CancelOrderDialog({ storeId, orderId, orderNumber, open, onOpenChange }: Target & {
  orderNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      if (toastResult(await cancelOrder({ storeId, orderId, reason }))) {
        onOpenChange(false);
        setReason("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

/** Less common actions, kept away from the main button so Cancel isn't tapped by mistake. */
export function OrderMoreMenu({ storeId, orderId, orderNumber, canCancel }: Target & { orderNumber: string; canCancel: boolean }) {
  const [cancelling, setCancelling] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="lg" className="px-3">
            <MoreHorizontal />
            More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/print/orders/${orderId}`} target="_blank">
              <Printer />
              Print packing slip
            </Link>
          </DropdownMenuItem>
          {canCancel && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setCancelling(true)}>
                <Ban />
                {ORDER_ACTION_LABELS.cancel}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canCancel && (
        <CancelOrderDialog
          storeId={storeId}
          orderId={orderId}
          orderNumber={orderNumber}
          open={cancelling}
          onOpenChange={setCancelling}
        />
      )}
    </>
  );
}

/** Per-item action while packing: removes units the store cannot find from the order. */
export function MarkUnavailableDialog({ storeId, orderId, item, className }: Target & {
  item: { id: string; productName: string; variantName: string; quantity: number; unavailableQuantity: number };
  className?: string;
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
        <Button variant="outline" size="sm" className={className}>
          {ORDER_ACTION_LABELS["mark-unavailable"]}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{productTitle(item.productName, item.variantName)} not found?</DialogTitle>
          <DialogDescription>
            The units are removed from the bill. Online payments are refunded automatically and cash orders collect the
            lower total. This size&apos;s stock at the store is set to 0. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {remaining > 1 && (
          <Field>
            <FieldLabel htmlFor="unavailable-quantity">How many can&apos;t you find?</FieldLabel>
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
            Remove from order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type StoreLocation = { latitude: number; longitude: number };

const STATUS_RANK = { ONLINE: 0, BUSY: 1, OFFLINE: 2 } as const;

function distanceKm(a: StoreLocation, b: StoreLocation) {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const formatDistance = (km: number) => (km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km.toFixed(1)} km`);

type RiderOption = { partner: DeliveryPartner; distanceKm: number | null };

const canAssign = (partner: DeliveryPartner) => partner.status === "ONLINE" && !partner.cash.limitReached;

/**
 * Free riders first, nearest to the store first (straight line from their last position, which is
 * at most 10 minutes old); riders without a recent position come after those with one.
 */
function riderOptions(partners: DeliveryPartner[], store: StoreLocation | null): RiderOption[] {
  return partners
    .map((partner) => ({ partner, distanceKm: store && partner.lastLocation ? distanceKm(store, partner.lastLocation) : null }))
    .sort(
      (a, b) =>
        STATUS_RANK[a.partner.status] - STATUS_RANK[b.partner.status] ||
        (a.distanceKm ?? Number.MAX_VALUE) - (b.distanceKm ?? Number.MAX_VALUE),
    );
}

/** The free rider closest to the store, if any has shared a position. */
function nearestFreeRider(partners: DeliveryPartner[], store: StoreLocation | null) {
  const [first] = riderOptions(partners, store);
  return first && canAssign(first.partner) && first.distanceKm !== null ? first.partner.id : "";
}

function riderLabel({ partner, distanceKm }: RiderOption, nearest: boolean, store: StoreLocation | null) {
  const parts = [partner.name ?? partner.phone];
  if (partner.vehicleNumber) parts.push(partner.vehicleNumber);
  if (partner.status === "BUSY") parts.push(`Busy${partner.activeDelivery ? ` with ${partner.activeDelivery.orderNumber}` : ""}`);
  if (partner.status === "OFFLINE") parts.push("Offline");
  if (partner.cash.limitReached) parts.push("Cash limit reached");
  else if (partner.status === "ONLINE" && store) {
    parts.push(distanceKm === null ? "location unknown" : `${formatDistance(distanceKm)} from store${nearest ? " (nearest)" : ""}`);
  }
  return parts.join(" · ");
}

function PartnerSelect({ id, partners, store, value, onChange }: {
  id: string;
  partners: DeliveryPartner[];
  store: StoreLocation | null;
  value: string;
  onChange: (value: string) => void;
}) {
  const nearest = nearestFreeRider(partners, store);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose a rider" />
      </SelectTrigger>
      <SelectContent>
        {riderOptions(partners, store).map((option) => (
          <SelectItem key={option.partner.id} value={option.partner.id} disabled={!canAssign(option.partner)}>
            {riderLabel(option, option.partner.id === nearest, store)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function noRidersText(partners: DeliveryPartner[]) {
  if (partners.length === 0) return "No riders yet. Add one on the Riders page.";
  if (partners.some(canAssign)) return null;
  if (partners.some((partner) => partner.status === "ONLINE")) {
    return "Every free rider has reached the cash limit. Record their deposit on the Rider cash page.";
  }
  return "No rider is free right now. Busy riders become free when they finish or decline their delivery; offline riders need to go online in the rider app.";
}

/** Starts with the nearest free rider chosen, so assigning them is one click. */
function useAssign({ storeId, orderId, mode, initialPartnerId }: Target & { mode: "assign" | "reassign"; initialPartnerId: string }) {
  const [partnerId, setPartnerId] = useState(initialPartnerId);
  const [pending, startTransition] = useTransition();

  function submit(onDone?: () => void) {
    startTransition(async () => {
      if (toastResult(await assignPartner({ storeId, orderId, partnerId, mode }))) {
        setPartnerId("");
        onDone?.();
      }
    });
  }

  return { partnerId, setPartnerId, pending, submit };
}

/** "Assign rider" on a board ticket. */
export function AssignPartnerDialog({ storeId, orderId, mode, partners, store, className }: Target & {
  mode: "assign" | "reassign";
  partners: DeliveryPartner[];
  store: StoreLocation | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { partnerId, setPartnerId, pending, submit } = useAssign({ storeId, orderId, mode, initialPartnerId: nearestFreeRider(partners, store) });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" variant={mode === "assign" ? "default" : "outline"} className={className}>
          {ORDER_ACTION_LABELS[mode]}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ORDER_ACTION_LABELS[mode]}</DialogTitle>
          <DialogDescription>
            {mode === "assign"
              ? "The rider gets the delivery in their app and can accept or decline it."
              : "The current rider is released and the delivery moves to the new rider."}
          </DialogDescription>
        </DialogHeader>
        {partners.length > 0 && (
          <Field>
            <FieldLabel htmlFor={`partner-${orderId}`}>Rider</FieldLabel>
            <PartnerSelect id={`partner-${orderId}`} partners={partners} store={store} value={partnerId} onChange={setPartnerId} />
          </Field>
        )}
        {noRidersText(partners) && <p className="text-sm text-muted-foreground">{noRidersText(partners)}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
          <Button disabled={pending || !partnerId} onClick={() => submit(() => setOpen(false))}>
            {pending && <Loader2 className="animate-spin" />}
            {ORDER_ACTION_LABELS[mode]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Choosing a rider right on the order page. */
export function RiderPicker({ storeId, orderId, mode, partners, store, className }: Target & {
  mode: "assign" | "reassign";
  partners: DeliveryPartner[];
  store: StoreLocation | null;
  className?: string;
}) {
  const { partnerId, setPartnerId, pending, submit } = useAssign({ storeId, orderId, mode, initialPartnerId: nearestFreeRider(partners, store) });

  const hint = noRidersText(partners);
  if (partners.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>{hint}</p>;
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <FieldLabel htmlFor="rider-picker">{mode === "assign" ? "Choose a rider" : "Change to another rider"}</FieldLabel>
      <PartnerSelect id="rider-picker" partners={partners} store={store} value={partnerId} onChange={setPartnerId} />
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      <Button
        variant={mode === "assign" ? "default" : "outline"}
        disabled={pending || !partnerId}
        onClick={() => submit()}
      >
        {pending && <Loader2 className="animate-spin" />}
        {ORDER_ACTION_LABELS[mode]}
      </Button>
    </div>
  );
}
