import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type NoticeTone = "success" | "warning" | "danger" | "info";

const TONES: Record<NoticeTone, { icon: LucideIcon; className: string; iconClassName: string }> = {
  success: {
    icon: CircleCheck,
    className: "border-green-600/25 bg-green-50 dark:bg-green-500/10",
    iconClassName: "text-green-700 dark:text-green-400",
  },
  warning: {
    icon: TriangleAlert,
    className: "border-amber-600/30 bg-amber-50 dark:bg-amber-500/10",
    iconClassName: "text-amber-700 dark:text-amber-400",
  },
  danger: {
    icon: CircleAlert,
    className: "border-red-600/25 bg-red-50 dark:bg-red-500/10",
    iconClassName: "text-red-700 dark:text-red-400",
  },
  info: { icon: Info, className: "bg-muted/60", iconClassName: "text-muted-foreground" },
};

/** A one-glance status line: what is true right now, and what to do about it. */
export function Notice({ tone, title, children, className }: { tone: NoticeTone; title: ReactNode; children?: ReactNode; className?: string }) {
  const { icon: Icon, className: toneClassName, iconClassName } = TONES[tone];
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={cn("flex gap-3 rounded-xl border p-4", toneClassName, className)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", iconClassName)} aria-hidden />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-sm text-foreground/80">{children}</div>}
      </div>
    </div>
  );
}
