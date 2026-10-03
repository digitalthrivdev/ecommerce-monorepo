import { Pill } from "@/components/status-pill";
import { PARTNER_STATUS_LABELS } from "@/lib/format";
import type { DeliveryPartner } from "@/lib/types";

export function PartnerStatusBadge({ partner }: { partner: Pick<DeliveryPartner, "status" | "isActive"> }) {
  if (!partner.isActive) return <Pill tone="red">Switched off</Pill>;
  if (partner.status === "ONLINE") return <Pill tone="green">{PARTNER_STATUS_LABELS.ONLINE}</Pill>;
  if (partner.status === "BUSY") return <Pill tone="indigo">{PARTNER_STATUS_LABELS.BUSY}</Pill>;
  return <Pill tone="gray">{PARTNER_STATUS_LABELS.OFFLINE}</Pill>;
}
