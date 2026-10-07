import Link from "next/link";

import { Section } from "@/components/section";
import { Pill, type Tone } from "@/components/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { ImportJobSummary } from "@/lib/types";

function status(job: ImportJobSummary): { tone: Tone; label: string } {
  if (job.status === "running") return { tone: "blue", label: "Running" };
  if (job.status === "failed") return { tone: "red", label: "Failed" };
  if (job.status === "interrupted") return { tone: "red", label: "Interrupted" };
  if (job.result.productsFailed > 0 || job.result.imagesFailed > 0) return { tone: "amber", label: "Done, with problems" };
  return { tone: "green", label: "Done" };
}

/** The latest imports, so a result can be found again after leaving its page. */
export function RecentImports({ jobs, currentJobId, timezone }: { jobs: ImportJobSummary[]; currentJobId?: string; timezone: string }) {
  if (jobs.length === 0) return null;
  return (
    <Section title="Recent imports" hint="The last 20 imports of the past 7 days.">
      <div className="overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Products</TableHead>
              <TableHead className="text-right">Not saved</TableHead>
              <TableHead className="text-right">Images failed</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => {
              const { tone, label } = status(job);
              const { result } = job;
              return (
                <TableRow key={job.id} data-state={job.id === currentJobId ? "selected" : undefined}>
                  <TableCell>{formatDateTime(job.startedAt, timezone)}</TableCell>
                  <TableCell>{job.store.name}</TableCell>
                  <TableCell>
                    <Pill tone={tone}>{label}</Pill>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {result.productsCreated.toLocaleString("en-IN")} new, {result.productsUpdated.toLocaleString("en-IN")} updated
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{result.productsFailed}</TableCell>
                  <TableCell className="text-right tabular-nums">{result.imagesFailed}</TableCell>
                  <TableCell className="text-right">
                    {job.id !== currentJobId && (
                      <Link href={`/products/import?job=${job.id}`} className="text-sm font-medium underline-offset-4 hover:underline">
                        View
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Section>
  );
}
