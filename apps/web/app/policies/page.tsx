import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";

import { PageTitle } from "@/components/page-title";
import { getWebsite, sitePages } from "@/lib/website";

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getWebsite();
  return { title: "Policies", description: `Terms, privacy, refund and delivery policies of ${business.name}.` };
}

export default async function PoliciesPage() {
  const { business, pages } = await getWebsite();

  return (
    <>
      <PageTitle title="Policies">How {business.name} handles orders, payments, delivery and your information.</PageTitle>
      <div className="mx-auto w-full max-w-3xl px-5 py-12">
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
          {sitePages(pages).map((page) => (
            <li key={page.path}>
              <Link href={page.path} className="flex items-center gap-4 px-5 py-4 font-medium transition hover:bg-muted">
                <FileText className="size-5 text-primary-ink" aria-hidden />
                {page.title}
                <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
