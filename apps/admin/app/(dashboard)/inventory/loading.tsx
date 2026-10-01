import { Skeleton } from "@/components/ui/skeleton";

export default function InventoryLoading() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-9 w-full max-w-xl" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
