import type { Metadata } from "next";

import { CatalogImport } from "@/components/catalog/catalog-import";
import { RecentImports } from "@/components/catalog/recent-imports";
import { PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import type { ImportJobSummary } from "@/lib/types";

import { getImportStatus } from "./actions";

export const metadata: Metadata = { title: "Import products" };

export default async function ImportProductsPage({ searchParams }: PageProps<"/products/import">) {
  await requireAdmin();
  const { job: jobParam } = await searchParams;
  const jobId = typeof jobParam === "string" ? jobParam : undefined;

  const [status, recent, settings] = await Promise.all([
    jobId ? getImportStatus(jobId) : null,
    apiFetch<{ items: ImportJobSummary[] }>("/catalog-imports"),
    getPublicSettings(),
  ]);
  const job = status?.ok ? status.job : null;

  return (
    <>
      <PageHeader
        title="Import products"
        description="Add or update many products from one CSV file, with their prices and stock."
        back={{ href: "/products", label: "Products" }}
      />
      <div className="flex max-w-4xl flex-col gap-8 p-4 md:p-6">
        <CatalogImport key={job?.id ?? "new"} initialJob={job} />
        <RecentImports jobs={recent.items} currentJobId={job?.id} timezone={settings.timezone} />
      </div>
    </>
  );
}
