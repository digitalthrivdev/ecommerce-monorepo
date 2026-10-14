"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, FileCheck, Loader2, Upload } from "lucide-react";

import { getImportStatus, previewImport, startImport } from "@/app/(dashboard)/products/import/actions";
import { Notice } from "@/components/notice";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ImportJob, ImportPreview, ImportRowError } from "@/lib/types";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const POLL_MS = 2000;

const count = (value: number, one: string, many = `${one}s`) => `${value.toLocaleString("en-IN")} ${value === 1 ? one : many}`;

function ErrorTable({ errors, total }: { errors: ImportRowError[]; total?: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-96 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Row</TableHead>
              <TableHead className="w-40">Column</TableHead>
              <TableHead>Problem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {errors.map((error, index) => (
              <TableRow key={index}>
                <TableCell className="tabular-nums">{error.row ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{error.column ?? "—"}</TableCell>
                <TableCell className="whitespace-normal">{error.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {total !== undefined && total > errors.length && (
        <p className="text-sm text-muted-foreground">Showing the first {errors.length.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")} problems.</p>
      )}
    </div>
  );
}

function NameList({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  const shown = names.slice(0, 30);
  return (
    <p className="text-sm">
      <span className="font-medium">{label}:</span> {shown.join(", ")}
      {names.length > shown.length && ` and ${names.length - shown.length} more`}
    </p>
  );
}

function PreviewSummary({ preview }: { preview: ImportPreview }) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <li>{count(preview.rows, "row")} read</li>
        <li>
          Products: {preview.products.create.toLocaleString("en-IN")} new, {preview.products.update.toLocaleString("en-IN")} updated
        </li>
        <li>
          Sizes: {preview.variants.create.toLocaleString("en-IN")} new, {preview.variants.update.toLocaleString("en-IN")} updated
        </li>
        <li>Stock set on {count(preview.stockRows, "size")}</li>
        <li>{count(preview.imageRows, "row")} with an image link</li>
      </ul>
      <NameList label={`New categories (${preview.categories.create.length})`} names={preview.categories.create} />
      <NameList label={`New brands (${preview.brands.create.length})`} names={preview.brands.create} />
    </div>
  );
}

function JobProgress({ job }: { job: ImportJob }) {
  const { done, total } = job.progress;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Loader2 className="size-4 animate-spin" />
        {job.phase === "images" ? `Adding images: ${done} of ${total}` : `Saving products: ${done.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}`}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">You can leave this page; the import continues on the server. Come back to this address to see the result.</p>
    </div>
  );
}

function JobResult({ job }: { job: ImportJob }) {
  const { result } = job;
  const problems = [...result.failedProducts, ...result.warnings];
  const finishedClean = job.status === "done" && result.failedProducts.length === 0;
  return (
    <div className="flex flex-col gap-3">
      <Notice
        tone={finishedClean ? (result.imagesFailed > 0 ? "warning" : "success") : "danger"}
        title={job.status === "done" ? "Import finished" : "The import did not finish"}
      >
        {job.error && <p>{job.error}</p>}
        <p>
          Products: {result.productsCreated.toLocaleString("en-IN")} created, {result.productsUpdated.toLocaleString("en-IN")} updated. Sizes:{" "}
          {result.variantsCreated.toLocaleString("en-IN")} created, {result.variantsUpdated.toLocaleString("en-IN")} updated.
        </p>
        <p>
          {count(result.categoriesCreated, "new category", "new categories")}, {count(result.brandsCreated, "new brand")}, stock changed on{" "}
          {count(result.stockChanged, "size")}.
        </p>
        <p>
          Images: {result.imagesAdded} added, {result.imagesFailed} failed
          {result.imagesSkipped > 0 && `, ${result.imagesSkipped} skipped because the product already had that photo`}.
        </p>
        {result.failedProducts.length > 0 && (
          <p>{count(result.failedProducts.length, "product")} could not be saved; nothing of them was written. Fix them and import the file again.</p>
        )}
      </Notice>
      {problems.length > 0 && <ErrorTable errors={problems} />}
    </div>
  );
}

export function CatalogImport({ initialJob }: { initialJob: ImportJob | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [errors, setErrors] = useState<{ list: ImportRowError[]; total: number } | null>(null);
  const [message, setMessage] = useState<string>();
  const [job, setJob] = useState<ImportJob | null>(initialJob);
  const [pending, startTransition] = useTransition();

  const running = job?.status === "running";

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const timer = setTimeout(async () => {
      const status = await getImportStatus(job.id);
      if (!status.ok) return setMessage(status.error);
      setJob(status.job);
      // Updates the recent imports list.
      if (status.job.status !== "running") router.refresh();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [job, router]);

  function reset() {
    setPreview(null);
    setErrors(null);
    setMessage(undefined);
  }

  function formData() {
    const data = new FormData();
    data.set("file", file!);
    return data;
  }

  function check() {
    reset();
    if (!file) return setMessage("Choose a CSV file");
    if (file.size > MAX_FILE_BYTES) return setMessage("The file can be at most 5 MB");
    startTransition(async () => {
      const result = await previewImport(formData());
      if (!result.ok) return setMessage(result.error);
      setPreview(result.preview);
      if (result.preview.errorCount > 0) setErrors({ list: result.preview.errors, total: result.preview.errorCount });
    });
  }

  function runImport() {
    setMessage(undefined);
    startTransition(async () => {
      const result = await startImport(formData());
      if (!result.ok) {
        setMessage(result.error);
        if (result.errors) setErrors({ list: result.errors, total: result.errorCount ?? result.errors.length });
        return;
      }
      setJob(result.job);
      setPreview(null);
      router.replace(`${pathname}?job=${result.job.id}`, { scroll: false });
    });
  }

  function startOver() {
    reset();
    setFile(null);
    setJob(null);
    router.replace(pathname, { scroll: false });
  }

  const ready = preview !== null && preview.errorCount === 0 && !errors;

  if (job) {
    return (
      <Section title={running ? "Importing" : "Result"} hint={`Started ${new Date(job.startedAt).toLocaleString("en-IN")}`}>
        {running ? <JobProgress job={job} /> : <JobResult job={job} />}
        {message && <p className="text-sm text-destructive">{message}</p>}
        {!running && (
          <div>
            <Button variant="outline" onClick={startOver}>
              Import another file
            </Button>
          </div>
        )}
      </Section>
    );
  }

  return (
    <>
      <Section step={1} title="Fill in the template" hint="One row per size of a product. Open it in Excel or Google Sheets and save as CSV.">
        <div>
          <Button asChild variant="outline">
            <a href="/products/import/template" download>
              <Download />
              Download template
            </a>
          </Button>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Required columns: <code>name</code>, <code>category</code>, <code>sku</code> and <code>price</code>, and <code>gst_rate</code> for new
            products (0 for exempt goods). Leave out a column to keep what is saved today.
          </li>
          <li>
            Rows with the same <code>product_handle</code> are one product; its sizes differ by <code>option1_name</code>/<code>option1_value</code> (up to 3
            options, e.g. Size and Flavour). A product without options has one row. Without a handle, rows are grouped by name and brand.
          </li>
          <li>
            The <code>sku</code> identifies a size: importing again updates it and never creates a duplicate.
          </li>
          <li>
            <code>category</code> and <code>subcategory</code> (two levels at most) and <code>brand</code> are matched by name; missing ones are created.
          </li>
          <li>
            <code>price</code> and <code>compare_at_price</code> like 49.50; the compare-at price, shown struck through, must be at least the price.{" "}
            <code>available</code>: yes or no. <code>stock</code>: blank keeps the current stock, a number replaces it.
          </li>
          <li>
            <code>weight_grams</code>, <code>length_cm</code>, <code>breadth_cm</code> and <code>height_cm</code>: the packed parcel, used for
            shipping.
          </li>
          <li>
            <code>image_url</code>: a public link to a JPEG, PNG or WebP up to 10 MB. It is used only where the product has no photo yet; a failed image
            doesn&apos;t stop the import.
          </li>
          <li>Up to 10,000 rows and 5 MB per file. In Excel, format the barcode and HSN columns as Text so long numbers and leading zeros survive.</li>
        </ul>
      </Section>

      <Section step={2} title="Check the file" hint="Nothing is saved yet.">
        <div className="flex flex-wrap items-end gap-4">
          <Field className="w-72">
            <FieldLabel htmlFor="import-file">CSV file</FieldLabel>
            <Input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                reset();
              }}
            />
          </Field>
          <Button onClick={check} disabled={pending || !file}>
            {pending && !preview ? <Loader2 className="animate-spin" /> : <FileCheck />}
            Check file
          </Button>
        </div>
        {message && <p className="text-sm text-destructive">{message}</p>}
        {preview && (
          <Notice
            tone={errors ? "danger" : "success"}
            title={errors ? `${count(errors.total, "problem")} to fix before importing` : "Ready to import"}
          >
            <PreviewSummary preview={preview} />
          </Notice>
        )}
        {errors && <ErrorTable errors={errors.list} total={errors.total} />}
      </Section>

      <Section step={3} title="Import" hint="The file is checked again, then saved in the background. Products that can't be saved are listed afterwards.">
        <div>
          <Button onClick={runImport} disabled={pending || !ready}>
            {pending && preview ? <Loader2 className="animate-spin" /> : <Upload />}
            {preview ? `Import ${count(preview.products.create + preview.products.update, "product")}` : "Import"}
          </Button>
        </div>
      </Section>
    </>
  );
}
