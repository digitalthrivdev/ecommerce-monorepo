import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionProps = {
  title: string;
  /** One short line explaining the section; skip it when the title says enough. */
  hint?: ReactNode;
  /** Buttons or links on the right of the heading. */
  actions?: ReactNode;
  /** Numbered steps for set-up flows. */
  step?: number;
  className?: string;
  id?: string;
  children: ReactNode;
};

/** A titled part of a page. The heading sits outside the content, so pages aren't a stack of boxes. */
export function Section({ title, hint, actions, step, className, id, children }: SectionProps) {
  return (
    <section id={id} className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 gap-3">
          {step !== undefined && (
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {step}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** The white surface for a table, list or form. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-xl border bg-card shadow-xs", className)}>{children}</div>;
}

/** A card with its title inside, for two-column editors. */
export function Block({ title, hint, actions, className, children }: { title: string; hint?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Panel className={cn("flex flex-col gap-4 p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </Panel>
  );
}

/** Page content area under the header. `narrow` for forms and single-column pages. */
export function PageBody({ narrow = false, className, children }: { narrow?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex w-full flex-col gap-8 px-4 pt-4 pb-12 md:px-6", narrow && "max-w-4xl", className)}>{children}</div>
  );
}
