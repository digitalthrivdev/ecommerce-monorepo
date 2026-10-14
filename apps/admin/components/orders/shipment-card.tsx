import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import { CopyButton, ShipmentActions } from "@/components/orders/order-actions";
import { Block } from "@/components/section";
import { ShipmentStatusPill } from "@/components/status-pill";
import { formatDateTime, formatNumber, SHIPMENT_STATUS_LABELS } from "@/lib/format";
import { MANUAL_CARRIER, type OrderAction, type Shipment } from "@/lib/types";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-all">{children}</dd>
    </div>
  );
}

/** The order's shipment: courier, AWB, label and tracking history (newest first). */
export function ShipmentCard({ orderId, shipment, allowedActions, timezone }: {
  orderId: string;
  shipment: Shipment;
  allowedActions: OrderAction[];
  timezone: string;
}) {
  const date = (value: string) => formatDateTime(value, timezone);
  const { parcel } = shipment;
  const cancelled = shipment.status === "CANCELLED";

  return (
    <Block
      title="Shipment"
      hint={cancelled ? "Cancelled. Ship the order again to book a new one." : `Booked ${date(shipment.createdAt)}`}
      actions={<ShipmentStatusPill status={shipment.status} size="md" />}
    >
      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
        <Row label="Carrier">
          <span className="capitalize">{shipment.provider === MANUAL_CARRIER ? "Manual" : shipment.provider}</span>
        </Row>
        <Row label="Courier">{shipment.courierName ?? <span className="text-muted-foreground">Not assigned yet</span>}</Row>
        <Row label="AWB">
          {shipment.awb ? (
            <span className="inline-flex items-center gap-1 font-mono">
              {shipment.awb}
              <CopyButton value={shipment.awb} label="AWB" />
            </span>
          ) : (
            <span className="text-muted-foreground">Not assigned yet</span>
          )}
        </Row>
        <Row label="Parcel">
          {formatNumber(parcel.weightGrams)} g · {Number(parcel.lengthCm)} × {Number(parcel.breadthCm)} × {Number(parcel.heightCm)} cm
        </Row>
        {shipment.trackingUrl && (
          <Row label="Tracking">
            <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary-ink underline-offset-4 hover:underline">
              Courier&apos;s tracking page
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </Row>
        )}
      </dl>

      {!cancelled && (
        <ShipmentActions orderId={orderId} provider={shipment.provider} labelUrl={shipment.labelUrl} allowedActions={allowedActions} />
      )}

      {shipment.events.length > 0 && (
        <ol aria-label="Tracking history" className="relative ml-1 flex flex-col gap-4 border-t pt-4">
          {shipment.events.toReversed().map((event, index) => (
            <li key={index} className="relative border-l pl-5">
              <span className="absolute top-1.5 -left-[5px] size-2.5 rounded-full border-2 border-background bg-primary" />
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{SHIPMENT_STATUS_LABELS[event.status]}</span>
                <span className="text-xs text-muted-foreground">{date(event.occurredAt)}</span>
              </div>
              {(event.location || event.description) && (
                <p className="text-sm text-muted-foreground">{[event.location, event.description].filter(Boolean).join(" · ")}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Block>
  );
}
