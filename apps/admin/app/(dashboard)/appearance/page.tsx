import type { Metadata } from "next";

import { AppearanceEditor } from "@/components/appearance/appearance-editor";
import { PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import type { AdminAppearance, Category, Paginated } from "@/lib/types";

export const metadata: Metadata = { title: "Appearance" };

export default async function AppearancePage() {
  await requireAdmin();
  const [appearance, categories, deployment] = await Promise.all([
    apiFetch<AdminAppearance>("/settings/appearance"),
    apiFetch<Paginated<Category>>("/categories", { query: { includeInactive: true, limit: 100 } }),
    getPublicSettings(),
  ]);

  return (
    <>
      <PageHeader
        title="Appearance"
        description={
          appearance.updatedAt
            ? `Branding and the customer app home screen. Last saved ${formatDateTime(appearance.updatedAt, deployment.timezone)}.`
            : "Branding and the customer app home screen. Using the defaults from the server configuration until you save."
        }
      />
      <div className="p-4 md:p-6">
        <AppearanceEditor key={appearance.updatedAt ?? "defaults"} initial={appearance} categories={categories.items} />
      </div>
    </>
  );
}
