import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone } from "lucide-react";

import { ComplaintStatusPill } from "@/components/returns/complaint-status-pill";
import { BookReversePickupButton } from "@/components/returns/book-reverse-pickup-button";
import { RefundDialog } from "@/components/returns/refund-dialog";
import { ResolveComplaintDialog } from "@/components/returns/resolve-complaint-dialog";
import { ReversePickupForm } from "@/components/returns/reverse-pickup-form";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Block, PageBody, Panel, Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { COMPLAINT_REASON_LABELS, formatDateTime, formatMoney, personName, productTitle, REFUND_METHOD_LABELS } from "@/lib/format";
import type { ComplaintDetail } from "@/lib/types";

export const metadata: Metadata = { title: "Return" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

async function getComplaint(id: string) {
  try {
    return await apiFetch<ComplaintDetail>(`/admin/returns/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
}

export default async function ComplaintPage({ params }: PageProps<"/returns/[complaintId]">) {
  await requireAdmin();
  const { complaintId } = await params;
  const [complaint, settings] = await Promise.all([getComplaint(complaintId), getPublicSettings()]);

  const money = (amount: string) => formatMoney(amount, settings.currency);
  const date = (value: string) => formatDateTime(value, settings.timezone);
  const { order, customer } = complaint;
  const isOpen = complaint.status === "OPEN";
  const isApproved = complaint.status === "APPROVED";

  return (
    <>
      <PageHeader
        back={{ href: "/returns", label: "Returns" }}
        title={COMPLAINT_REASON_LABELS[complaint.reason]}
        status={<ComplaintStatusPill status={complaint.status} size="md" />}
        description={`Order ${order.orderNumber} · requested ${date(complaint.createdAt)}`}
        actions={
          isOpen && (
            <>
              <ResolveComplaintDialog complaintId={complaint.id} status="REJECTED" />
              <ResolveComplaintDialog complaintId={complaint.id} status="APPROVED" />
            </>
          )
        }
      />

      <PageBody className="max-w-6xl gap-6">
        {!isOpen && (
          <Notice
            tone={complaint.status === "RESOLVED" ? "success" : complaint.status === "APPROVED" ? "info" : "danger"}
            title={`${complaint.status === "RESOLVED" ? "Return received and refunded" : complaint.status === "APPROVED" ? "Return approved" : "Return rejected"}${complaint.resolvedAt ? ` ${date(complaint.resolvedAt)}` : ""}${complaint.resolvedBy ? ` by ${complaint.resolvedBy}` : ""}`}
          >
            {complaint.resolutionNote}
          </Notice>
        )}
        {isOpen && Number(complaint.refundable) <= 0 && (
          <Notice tone="info" title="Nothing left to refund on this order">
            Reject the return request with a message to the customer.
          </Notice>
        )}
        {isApproved && (
          <Section title="Reverse pickup and receipt" hint="Use the carrier’s reverse pickup service, or record a self arranged return here.">
            <Panel className="flex flex-col gap-3 p-5">
              <ReversePickupForm complaintId={complaint.id} courierName={complaint.reverseCourierName} awb={complaint.reverseAwb} trackingUrl={complaint.reverseTrackingUrl} />
              {complaint.canBookReversePickup && !complaint.reverseAwb && <BookReversePickupButton complaintId={complaint.id} />}
              {complaint.reverseTrackingUrl && <a className="text-sm underline" href={complaint.reverseTrackingUrl} target="_blank" rel="noreferrer">Track return pickup</a>}
              <RefundDialog
                target={{ complaintId: complaint.id }}
                paymentMethod={order.paymentMethod}
                defaultAmount={complaint.suggestedRefund}
                refundable={complaint.refundable}
                currency={settings.currency}
                label="Receive return and refund"
              />
            </Panel>
          </Section>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-6">
            <Section title="What the customer said">
              <Panel className="flex flex-col gap-4 p-5">
                <p className="text-sm whitespace-pre-line">{complaint.note ?? <span className="text-muted-foreground">No description.</span>}</p>
                {complaint.photoUrls.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {complaint.photoUrls.map((url) => (
                      <a key={url} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border">
                        {/* Uploaded to the API server, whose host next/image doesn't know. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url.replace(/\.webp$/, "-sm.webp")} alt="Photo from the customer" className="size-32 object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </Panel>
            </Section>

            <Section title="Requested items" hint={`Paid value ${money(complaint.items.reduce((sum, item) => sum + Number(item.value), 0).toFixed(2))}`}>
              <Panel className="divide-y">
                {complaint.items.map((item) => (
                  <div key={item.orderItemId} className="flex items-center gap-3 p-4">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- product images uploaded to the API server
                      <img src={item.imageUrl} alt="" className="size-12 shrink-0 rounded-md border object-cover" />
                    ) : (
                      <div className="size-12 shrink-0 rounded-md border bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{productTitle(item.productName, item.variantName)}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} reported · {item.deliveredQuantity} delivered · {money(item.unitPrice)} each · SKU {item.sku}
                      </p>
                    </div>
                    <p className="font-semibold tabular-nums">{money(item.value)}</p>
                  </div>
                ))}
              </Panel>
            </Section>

            {complaint.refunds.length > 0 && (
              <Section title="Refunds">
                <Panel className="divide-y">
                  {complaint.refunds.map((refund) => (
                    <div key={refund.id} className="flex flex-wrap items-start justify-between gap-2 p-4 text-sm">
                      <div>
                        <p className="font-medium">
                          {money(refund.amount)} · {REFUND_METHOD_LABELS[refund.method]}
                          {refund.reference && <span className="text-muted-foreground"> · {refund.reference}</span>}
                        </p>
                        <p className="text-muted-foreground">{refund.reason}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {date(refund.createdAt)}
                        {refund.createdBy && ` · ${refund.createdBy}`}
                      </p>
                    </div>
                  ))}
                </Panel>
              </Section>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <Block title="Customer">
              <div className="flex flex-col gap-3 text-sm">
                <div>
                  <p className="text-base font-semibold">
                    {customer ? (
                      <Link href={`/customers/${customer.id}`} className="underline-offset-4 hover:underline">
                        {personName(customer)}
                      </Link>
                    ) : (
                      order.customerName
                    )}
                  </p>
                  <p className="text-muted-foreground tabular-nums">{order.customerPhone}</p>
                  {customer && customer.complaintCount > 1 && (
                    <p className="mt-1 font-medium text-amber-700 dark:text-amber-400">{customer.complaintCount} return requests in total</p>
                  )}
                </div>
                <Button asChild variant="outline" className="w-full">
                  <a href={`tel:${order.customerPhone}`}>
                    <Phone />
                    Call customer
                  </a>
                </Button>
              </div>
            </Block>

            <Block title="Order">
              <dl className="flex flex-col gap-2">
                <Row label="Order">
                  <Link href={`/orders/${order.id}`} className="font-medium underline-offset-4 hover:underline">
                    {order.orderNumber}
                  </Link>
                </Row>
                <Row label="Payment">{order.paymentMethod === "COD" ? "Cash on delivery" : "Online"}</Row>
                <Row label="Total">{money(order.total)}</Row>
                <Row label="Can still refund">{money(complaint.refundable)}</Row>
                {order.deliveredAt && <Row label="Delivered">{date(order.deliveredAt)}</Row>}
              </dl>
            </Block>
          </div>
        </div>
      </PageBody>
    </>
  );
}
