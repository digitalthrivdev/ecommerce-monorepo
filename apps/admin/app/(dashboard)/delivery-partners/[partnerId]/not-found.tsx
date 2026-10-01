import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function PartnerNotFound() {
  return (
    <>
      <PageHeader title="Partner not found" />
      <div className="flex flex-col items-start gap-3 p-4 md:p-6">
        <p className="text-sm text-muted-foreground">This delivery partner does not exist.</p>
        <Button asChild variant="outline">
          <Link href="/delivery-partners">Back to delivery partners</Link>
        </Button>
      </div>
    </>
  );
}
