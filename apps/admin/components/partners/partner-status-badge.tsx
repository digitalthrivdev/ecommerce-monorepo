import { Badge } from "@/components/ui/badge";
import { PARTNER_STATUS_LABELS } from "@/lib/format";
import type { DeliveryPartner } from "@/lib/types";

export function PartnerStatusBadge({ partner }: { partner: Pick<DeliveryPartner, "status" | "isActive"> }) {
  if (!partner.isActive) return <Badge variant="outline">Deactivated</Badge>;
  if (partner.status === "ONLINE") return <Badge>{PARTNER_STATUS_LABELS.ONLINE}</Badge>;
  if (partner.status === "BUSY") return <Badge variant="secondary">{PARTNER_STATUS_LABELS.BUSY}</Badge>;
  return <Badge variant="outline">{PARTNER_STATUS_LABELS.OFFLINE}</Badge>;
}
