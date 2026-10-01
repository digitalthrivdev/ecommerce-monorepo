import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function OrderNotFound() {
  return (
    <>
      <PageHeader title="Order not found" />
      <div className="flex flex-col items-start gap-3 p-4 md:p-6">
        <p className="text-sm text-muted-foreground">This order does not exist or you do not have access to it.</p>
        <Button asChild variant="outline">
          <Link href="/orders">Back to orders</Link>
        </Button>
      </div>
    </>
  );
}
