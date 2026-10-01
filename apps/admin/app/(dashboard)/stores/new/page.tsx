import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { StoreForm } from "@/components/stores/store-form";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/dal";

export const metadata: Metadata = { title: "New store" };

export default async function NewStorePage() {
  await requireAdmin();

  return (
    <>
      <PageHeader title="New store" description="Then list products with prices, stock it and add staff." />
      <div className="p-4 md:p-6">
        <Card className="max-w-3xl">
          <CardContent>
            <StoreForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
