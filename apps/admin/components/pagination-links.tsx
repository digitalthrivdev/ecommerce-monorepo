import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Previous/Next links for a 1-based page. `href` builds the URL for a page number. */
export function PaginationLinks({ page, lastPage, href }: { page: number; lastPage: number; href: (page: number) => string }) {
  return (
    <div className="flex gap-2">
      <Button asChild variant="outline" size="sm" className={cn(page <= 1 && "pointer-events-none opacity-50")}>
        <Link href={href(page - 1)} aria-disabled={page <= 1}>
          Previous
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm" className={cn(page >= lastPage && "pointer-events-none opacity-50")}>
        <Link href={href(page + 1)} aria-disabled={page >= lastPage}>
          Next
        </Link>
      </Button>
    </div>
  );
}
