import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function CustomerNotFound() {
  return (
    <>
      <PageHeader title="Customer not found" />
      <div className="flex flex-col items-start gap-3 p-4 md:p-6">
        <p className="text-sm text-muted-foreground">This customer does not exist.</p>
        <Button asChild variant="outline">
          <Link href="/customers">Back to customers</Link>
        </Button>
      </div>
    </>
  );
}
