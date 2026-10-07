import type { ReactNode } from "react";

/** The tinted band at the top of an inner page. */
export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="border-b bg-primary-soft">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        {eyebrow && <p className="text-sm font-semibold tracking-wider text-primary-ink uppercase">{eyebrow}</p>}
        <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{title}</h1>
        {children && <div className="mt-3 text-muted-foreground">{children}</div>}
      </div>
    </div>
  );
}
