import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { SidebarTrigger } from "@/components/ui/sidebar";

type PageHeaderProps = {
  title: string;
  /** One short line under the title. */
  description?: ReactNode;
  /** Where the back link goes, e.g. `{ href: "/orders", label: "Orders" }`. */
  back?: { href: string; label: string };
  /** Shown next to the title, e.g. a status pill. */
  status?: ReactNode;
  /** The page's main action(s), on the right; they wrap under the title on narrow screens. */
  actions?: ReactNode;
};

export function PageHeader({ title, description, back, status, actions }: PageHeaderProps) {
  return (
    <header className="px-4 pt-3 pb-1 md:px-6 md:pt-4">
      <div className="mb-2 flex min-h-9 items-center gap-1">
        <SidebarTrigger className="-ml-2 size-9 text-muted-foreground" />
        {back && (
          <Link
            href={back.href}
            className="inline-flex h-9 items-center gap-1 rounded-lg pr-2 pl-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            {back.label}
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-2xl font-bold">{title}</h1>
            {status}
          </div>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
