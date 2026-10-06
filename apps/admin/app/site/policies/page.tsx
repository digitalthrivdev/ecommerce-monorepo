import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { getSiteBase, getWebsite, sitePages } from "@/lib/website";

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getWebsite();
  return { title: "Policies", description: `Terms, privacy, refund and delivery policies of ${business.name}.` };
}

export default async function PoliciesPage() {
  const [{ business, pages }, base] = await Promise.all([getWebsite(), getSiteBase()]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Policies</h1>
        <p className="mt-2 text-muted-foreground">How {business.name} handles orders, payments, delivery and your information.</p>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {sitePages(pages).map((page) => (
          <li key={page.path}>
            <Link href={`${base}${page.path}`} className="flex items-center justify-between gap-4 px-5 py-4 font-medium hover:bg-muted/60">
              {page.title}
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
