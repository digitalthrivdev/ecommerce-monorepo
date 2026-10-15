import { CircleCheck, CircleX, MessageSquareWarning, type LucideIcon } from "lucide-react";

import { Pill, type Tone } from "@/components/status-pill";
import { COMPLAINT_STATUS_LABELS } from "@/lib/format";
import type { ComplaintStatus } from "@/lib/types";

const STYLE: Record<ComplaintStatus, { tone: Tone; icon: LucideIcon }> = {
  OPEN: { tone: "amber", icon: MessageSquareWarning },
  APPROVED: { tone: "blue", icon: MessageSquareWarning },
  RECEIVED: { tone: "blue", icon: MessageSquareWarning },
  RESOLVED: { tone: "green", icon: CircleCheck },
  REJECTED: { tone: "gray", icon: CircleX },
};

export function ComplaintStatusPill({ status, size }: { status: ComplaintStatus; size?: "sm" | "md" }) {
  const { tone, icon } = STYLE[status];
  return (
    <Pill tone={tone} icon={icon} size={size}>
      {COMPLAINT_STATUS_LABELS[status]}
    </Pill>
  );
}
