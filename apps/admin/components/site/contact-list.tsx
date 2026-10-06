import { Building2, Mail, Phone } from "lucide-react";

import type { PolicyBusiness } from "@/lib/types";

/** The business's address, email and phone, whichever are set. */
export function ContactList({ business }: { business: PolicyBusiness }) {
  const rows = [
    business.address && { icon: Building2, label: "Address", value: business.address, href: null },
    business.email && { icon: Mail, label: "Email", value: business.email, href: `mailto:${business.email}` },
    business.phone && { icon: Phone, label: "Phone", value: business.phone, href: `tel:${business.phone}` },
  ].filter((row) => typeof row === "object" && row !== null);

  if (rows.length === 0) {
    return <p className="text-muted-foreground">Contact details will be added here soon.</p>;
  }

  return (
    <dl className="divide-y rounded-xl border bg-card">
      {rows.map(({ icon: Icon, label, value, href }) => (
        <div key={label} className="flex gap-4 px-5 py-4">
          <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-medium break-words whitespace-pre-line">
              {href ? (
                <a href={href} className="text-primary-ink underline underline-offset-4">
                  {value}
                </a>
              ) : (
                value
              )}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
