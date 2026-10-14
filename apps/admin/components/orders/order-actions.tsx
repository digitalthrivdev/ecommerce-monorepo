"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { Ban, Copy, FileDown, Loader2, MoreHorizontal, Plus, Printer, RefreshCw, Truck } from "lucide-react";
import { toast } from "sonner";

import {
  addTrackingUpdate,
  cancelOrder,
  cancelShipment,
  fetchShipmentLabel,
  markItemUnavailable,
  packOrder,
  shipOrder,
  syncShipmentTracking,
} from "@/app/(dashboard)/orders/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";
import { ORDER_ACTION_LABELS, productTitle, SHIPMENT_STATUS_LABELS } from "@/lib/format";
import { toastResult } from "@/lib/action-toast";
import { nextStep } from "@/lib/order-flow";
import { clearPackingTicks, usePackingTicks } from "@/lib/packing-ticks";
import {
  MANUAL_CARRIER,
  MANUAL_TRACKING_STATUSES,
  type ActionResult,
  type ActiveCarrier,
  type OrderAction,
  type OrderStatus,
} from "@/lib/types";

type Target = { orderId: string };
type ButtonSize = "default" | "lg";

/**
 * The one main button for the order's next step: Mark packed, or Ship order (opens the parcel
 * form). With `packItemIds`, Mark packed asks first when some items on the checklist aren't ticked.
 */
export function NextStepButton({
  orderId,
  orderNumber,
  status,
  allowedActions,
  carrier,
  packItemIds,
  size = "lg",
  className,
}: Target & {
  orderNumber: string;
  status: OrderStatus;
  allowedActions: OrderAction[];
  /** Null when not known (staff). */
  carrier: ActiveCarrier | null;
  packItemIds?: string[];
  size?: ButtonSize;
  className?: string;
}) {
  const step = nextStep(status, allowedActions);
  if (!step) return null;
  if (step.action === "ship") {
    return <ShipOrderDialog orderId={orderId} orderNumber={orderNumber} carrier={carrier} size={size} className={className} />;
  }
  return <PackButton orderId={orderId} packItemIds={packItemIds} size={size} className={className} />;
}

function PackButton({ orderId, packItemIds, size, className }: Target & { packItemIds?: string[]; size: ButtonSize; className?: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const { ticked } = usePackingTicks(orderId);
  const unticked = packItemIds ? packItemIds.filter((id) => !ticked.has(id)).length : 0;

  function go() {
    setConfirming(false);
    startTransition(async () => {
      if (toastResult(await packOrder({ orderId }))) clearPackingTicks(orderId);
    });
  }

  return (
    <>
      <Button size={size} disabled={pending} className={className} onClick={() => (unticked > 0 ? setConfirming(true) : go())}>
        {pending && <Loader2 className="animate-spin" />}
        {ORDER_ACTION_LABELS.pack}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {unticked} {unticked === 1 ? "item isn't" : "items aren't"} ticked. Mark packed anyway?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tick each item as you put it in the parcel. If something isn&apos;t on the shelf, use Item not found so the
              customer isn&apos;t charged for it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={go}>Mark packed</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** The last parcel size, kept on this device so similar parcels need no typing. */
const PARCEL_KEY = "ship-parcel";
const PARCEL_FIELDS = ["weightGrams", "lengthCm", "breadthCm", "heightCm"] as const;
type ParcelDraft = Partial<Record<(typeof PARCEL_FIELDS)[number], string>>;

function readLastParcel(): ParcelDraft {
  try {
    return JSON.parse(localStorage.getItem(PARCEL_KEY) ?? "{}") as ParcelDraft;
  } catch {
    return {};
  }
}

function rememberParcel(formData: FormData) {
  try {
    localStorage.setItem(PARCEL_KEY, JSON.stringify(Object.fromEntries(PARCEL_FIELDS.map((field) => [field, formData.get(field)]))));
  } catch {
    // Storage full or blocked; the form just starts empty next time.
  }
}

async function shipAndRemember(formData: FormData) {
  const result = await shipOrder(formData);
  if (result.ok) rememberParcel(formData);
  return result;
}

const PARCEL_INPUTS = [
  { field: "weightGrams", label: "Weight (g)", inputMode: "numeric", placeholder: "e.g. 750" },
  { field: "lengthCm", label: "Length (cm)", inputMode: "decimal", placeholder: "e.g. 30" },
  { field: "breadthCm", label: "Breadth (cm)", inputMode: "decimal", placeholder: "e.g. 20" },
  { field: "heightCm", label: "Height (cm)", inputMode: "decimal", placeholder: "e.g. 10" },
] as const;

/**
 * Books the shipment with the active carrier. The manual carrier needs the courier and AWB; staff
 * can't see which carrier is active, so for them those fields are optional and the API says when
 * they're needed.
 */
function ShipOrderDialog({ orderId, orderNumber, carrier, size = "lg", className }: Target & {
  orderNumber: string;
  carrier: ActiveCarrier | null;
  size?: ButtonSize;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} className={className}>
          <Truck />
          {ORDER_ACTION_LABELS.ship}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <ShipOrderForm orderId={orderId} orderNumber={orderNumber} carrier={carrier} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so the last parcel is read in the browser. */
function ShipOrderForm({ orderId, orderNumber, carrier, onDone }: Target & {
  orderNumber: string;
  carrier: ActiveCarrier | null;
  onDone: () => void;
}) {
  const [defaults] = useState(readLastParcel);
  const { pending, fieldErrors, onSubmit } = useFormAction(shipAndRemember, onDone);
  const manual = carrier?.name === MANUAL_CARRIER;
  const invalid = (name: string) => Boolean(fieldErrors[name]);
  const optional = !manual && <span className="font-normal text-muted-foreground">(optional)</span>;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" autoComplete="off">
      <input type="hidden" name="orderId" value={orderId} />
      <DialogHeader>
        <DialogTitle>Ship order {orderNumber}</DialogTitle>
        <DialogDescription>
          {manual
            ? "Book the courier yourself, then enter its name and AWB number here. The order is marked shipped and the customer is told."
            : carrier
              ? `Booked with ${carrier.label}. The order stays packed until the courier picks it up.`
              : "The packed parcel's weight and size, for the courier."}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <div className="grid grid-cols-2 gap-4">
          {PARCEL_INPUTS.map(({ field, label, inputMode, placeholder }) => (
            <Field key={field} data-invalid={invalid(field)}>
              <FieldLabel htmlFor={`ship-${field}`}>{label}</FieldLabel>
              <Input
                id={`ship-${field}`}
                name={field}
                inputMode={inputMode}
                placeholder={placeholder}
                defaultValue={defaults[field] ?? ""}
                required
                maxLength={10}
                aria-invalid={invalid(field)}
              />
              <FieldError>{fieldErrors[field]}</FieldError>
            </Field>
          ))}
        </div>
        {(manual || carrier === null) && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={invalid("courierName")}>
                <FieldLabel htmlFor="ship-courierName">Courier {optional}</FieldLabel>
                <Input
                  id="ship-courierName"
                  name="courierName"
                  maxLength={100}
                  placeholder="e.g. Delhivery"
                  required={manual}
                  aria-invalid={invalid("courierName")}
                />
                <FieldError>{fieldErrors.courierName}</FieldError>
              </Field>
              <Field data-invalid={invalid("awb")}>
                <FieldLabel htmlFor="ship-awb">AWB number {optional}</FieldLabel>
                <Input id="ship-awb" name="awb" maxLength={40} spellCheck={false} required={manual} aria-invalid={invalid("awb")} />
                {!manual && <FieldDescription>Required for manual shipping.</FieldDescription>}
                <FieldError>{fieldErrors.awb}</FieldError>
              </Field>
            </div>
            <Field data-invalid={invalid("trackingUrl")}>
              <FieldLabel htmlFor="ship-trackingUrl">
                Tracking link <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input
                id="ship-trackingUrl"
                name="trackingUrl"
                type="url"
                maxLength={500}
                placeholder="https://"
                aria-invalid={invalid("trackingUrl")}
              />
              <FieldDescription>The courier&apos;s page for this parcel, shown to the customer.</FieldDescription>
              <FieldError>{fieldErrors.trackingUrl}</FieldError>
            </Field>
          </>
        )}
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {ORDER_ACTION_LABELS.ship}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CancelOrderDialog({ orderId, orderNumber, open, onOpenChange }: Target & {
  orderNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      if (toastResult(await cancelOrder({ orderId, reason }))) {
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
          <DialogDescription>Stock is returned and online payments are refunded automatically. This cannot be undone.</DialogDescription>
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
export function OrderMoreMenu({ orderId, orderNumber, canCancel }: Target & {
  orderNumber: string;
  canCancel: boolean;
}) {
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
      {canCancel && <CancelOrderDialog orderId={orderId} orderNumber={orderNumber} open={cancelling} onOpenChange={setCancelling} />}
    </>
  );
}

/** Per-item action while packing: removes units that cannot be found from the order. */
export function MarkUnavailableDialog({ orderId, item, className }: Target & {
  item: { id: string; productName: string; variantName: string; quantity: number; unavailableQuantity: number };
  className?: string;
}) {
  const remaining = item.quantity - item.unavailableQuantity;
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(remaining));
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      if (toastResult(await markItemUnavailable({ orderId, itemId: item.id, quantity: Number(quantity) }))) {
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
            lower total. This size&apos;s stock is set to 0. This cannot be undone.
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

export function CopyButton({ value, label }: { value: string; label: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy. Select the ${label} and copy it instead.`);
    }
  }

  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label={`Copy ${label}`}>
      <Copy />
    </Button>
  );
}

function ShipmentButton({ action, icon, children }: { action: () => Promise<ActionResult>; icon: ReactNode; children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          toastResult(await action());
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </Button>
  );
}

function CancelShipmentButton({ orderId }: Target) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      if (toastResult(await cancelShipment({ orderId }))) setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-destructive">
          <Ban />
          {ORDER_ACTION_LABELS["cancel-shipment"]}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this shipment?</AlertDialogTitle>
          <AlertDialogDescription>
            The booking is cancelled with the carrier and the order goes back to packed, so it can be shipped again or
            cancelled.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep shipment</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            {pending && <Loader2 className="animate-spin" />}
            Cancel shipment
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** datetime-local has no time zone; the browser's is the admin's own. */
async function addTrackingInBrowserTime(formData: FormData) {
  const local = String(formData.get("occurredAt") ?? "");
  if (local) formData.set("occurredAt", new Date(local).toISOString());
  return addTrackingUpdate(formData);
}

function AddTrackingDialog({ orderId }: Target) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(addTrackingInBrowserTime, () => setOpen(false));
  const invalid = (name: string) => Boolean(fieldErrors[name]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus />
          {ORDER_ACTION_LABELS["add-tracking"]}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="orderId" value={orderId} />
          <DialogHeader>
            <DialogTitle>Add a tracking update</DialogTitle>
            <DialogDescription>
              From the courier&apos;s tracking page. The order and the customer&apos;s app follow it; Delivered marks cash on
              delivery as collected.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={invalid("status")}>
              <FieldLabel htmlFor="tracking-status">What happened</FieldLabel>
              <Select name="status" required>
                <SelectTrigger id="tracking-status" className="w-full" aria-invalid={invalid("status")}>
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_TRACKING_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {SHIPMENT_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{fieldErrors.status}</FieldError>
            </Field>
            <Field data-invalid={invalid("occurredAt")}>
              <FieldLabel htmlFor="tracking-time">
                When <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input id="tracking-time" name="occurredAt" type="datetime-local" aria-invalid={invalid("occurredAt")} />
              <FieldDescription>Leave empty for now.</FieldDescription>
              <FieldError>{fieldErrors.occurredAt}</FieldError>
            </Field>
            <Field data-invalid={invalid("location")}>
              <FieldLabel htmlFor="tracking-location">
                Location <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input id="tracking-location" name="location" maxLength={200} placeholder="e.g. Pune hub" aria-invalid={invalid("location")} />
              <FieldError>{fieldErrors.location}</FieldError>
            </Field>
            <Field data-invalid={invalid("description")}>
              <FieldLabel htmlFor="tracking-description">
                Note <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Textarea id="tracking-description" name="description" maxLength={500} rows={2} aria-invalid={invalid("description")} />
              <FieldError>{fieldErrors.description}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Add update
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Label, tracking and cancel buttons under the shipment. Manual shipments have no label or carrier tracking. */
export function ShipmentActions({ orderId, provider, labelUrl, allowedActions }: Target & {
  provider: string;
  labelUrl: string | null;
  allowedActions: OrderAction[];
}) {
  const manual = provider === MANUAL_CARRIER;
  return (
    <div className="flex flex-wrap gap-2">
      {labelUrl ? (
        <Button asChild variant="outline">
          <a href={labelUrl} target="_blank" rel="noreferrer">
            <Printer />
            Print label
          </a>
        </Button>
      ) : (
        !manual && (
          <ShipmentButton action={() => fetchShipmentLabel({ orderId })} icon={<FileDown />}>
            Get label
          </ShipmentButton>
        )
      )}
      {!manual && (
        <ShipmentButton action={() => syncShipmentTracking({ orderId })} icon={<RefreshCw />}>
          Refresh tracking
        </ShipmentButton>
      )}
      {allowedActions.includes("add-tracking") && <AddTrackingDialog orderId={orderId} />}
      {allowedActions.includes("cancel-shipment") && <CancelShipmentButton orderId={orderId} />}
    </div>
  );
}
