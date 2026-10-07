import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function RiderCashNotFound() {
  return (
    <>
      <PageHeader title="Rider not found" />
      <div className="flex flex-col items-start gap-3 p-4 md:p-6">
        <p className="text-sm text-muted-foreground">This rider does not exist.</p>
        <Button asChild variant="outline">
          <Link href="/rider-cash">Back to rider cash</Link>
        </Button>
      </div>
    </>
  );
}
