"use client";

import { useState, useTransition } from "react";
import { History, Loader2 } from "lucide-react";

import { adjustStock, getStockHistory, setVariantActive, type StockHistoryResult } from "@/app/(dashboard)/inventory/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toastResult } from "@/lib/action-toast";
import { formatDateTime, STOCK_REASON_LABELS } from "@/lib/format";
import type { StockChangeReason } from "@/lib/types";
import { cn } from "@/lib/utils";

type Target = { variantId: string };
type Mode = "add" | "remove" | "set";
type ManualReason = Exclude<StockChangeReason, "ORDER_UNAVAILABLE">;

const MODE_COPY: Record<Mode, { label: string; field: string; hint: string; reasons: ManualReason[] }> = {
  add: { label: "Add stock", field: "Quantity received", hint: "Use when new stock arrives.", reasons: ["RESTOCK", "CORRECTION"] },
  remove: { label: "Remove", field: "Quantity to remove", hint: "Use for damaged, expired or missing items.", reasons: ["DAMAGE", "CORRECTION"] },
  set: {
    label: "Set count",
    field: "Counted quantity",
    hint: "Use after a physical stock count. Replaces the current quantity.",
    reasons: ["CORRECTION", "RESTOCK", "DAMAGE"],
  },
};

export function StockAdjustDialog({ variantId, title, currentStock }: Target & {
  /** Product name with the variant label. */
  title: string;
  currentStock: number;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("add");
  const [reason, setReason] = useState<ManualReason>("RESTOCK");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const value = Number(amount);
  const valid = amount !== "" && Number.isInteger(value) && value >= 0 && (mode === "set" || value > 0);
  const preview = !valid ? null : mode === "add" ? currentStock + value : mode === "remove" ? currentStock - value : value;

  function changeMode(next: Mode) {
    setMode(next);
    setReason(MODE_COPY[next].reasons[0]!);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      changeMode("add");
      setAmount("");
      setNote("");
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      if (toastResult(await adjustStock({ variantId, mode, amount, reason, note }))) {
        onOpenChange(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Adjust
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Adjust stock</DialogTitle>
            <DialogDescription>
              {title} · {currentStock} in stock
            </DialogDescription>
          </DialogHeader>
          <Tabs value={mode} onValueChange={(next) => changeMode(next as Mode)}>
            <TabsList className="w-full">
              {(Object.keys(MODE_COPY) as Mode[]).map((candidate) => (
                <TabsTrigger key={candidate} value={candidate}>
                  {MODE_COPY[candidate].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Field>
            <FieldLabel htmlFor="stock-amount">{MODE_COPY[mode].field}</FieldLabel>
            <Input
              id="stock-amount"
              type="number"
              inputMode="numeric"
              min={mode === "set" ? 0 : 1}
              max={mode === "remove" ? currentStock : 1_000_000}
              step={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              autoFocus
              required
            />
            <FieldDescription>
              {MODE_COPY[mode].hint}
              {preview !== null && (
                <>
                  {" "}
                  New stock: <span className={preview < 0 ? "text-destructive" : "font-medium text-foreground"}>{preview}</span>
                </>
              )}
            </FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="stock-reason">Reason</FieldLabel>
              <Select value={reason} onValueChange={(next) => setReason(next as ManualReason)}>
                <SelectTrigger id="stock-reason" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_COPY[mode].reasons.map((candidate) => (
                    <SelectItem key={candidate} value={candidate}>
                      {STOCK_REASON_LABELS[candidate]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="stock-note">Note</FieldLabel>
              <Input id="stock-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder="Optional, e.g. invoice number" />
            </Field>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || !valid || (preview !== null && preview < 0)}>
              {pending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Who changed the stock, when and why. */
export function StockHistoryDialog({ variantId, title, timezone }: Target & { title: string; timezone: string }) {
  const [result, setResult] = useState<StockHistoryResult | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(open: boolean) {
    if (!open) return;
    setResult(null);
    startTransition(async () => setResult(await getStockHistory({ variantId })));
  }

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={`Stock history of ${title}`}>
          <History />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Stock history</DialogTitle>
          <DialogDescription>{title} · the latest 50 changes. Orders and cancellations are not listed.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          {pending || !result ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !result.ok ? (
            <p className="py-8 text-center text-sm text-destructive">{result.error}</p>
          ) : result.history.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No manual changes yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">After</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.history.items.map((change) => (
                  <TableRow key={change.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatDateTime(change.createdAt, timezone)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {STOCK_REASON_LABELS[change.reason]}
                      {change.note && <div className="text-xs text-muted-foreground">{change.note}</div>}
                    </TableCell>
                    <TableCell className={cn("text-right tabular-nums", change.delta < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-500")}>
                      {change.delta > 0 ? `+${change.delta}` : change.delta}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{change.quantityAfter}</TableCell>
                    <TableCell>{change.changedBy?.name ?? "System"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VariantActiveSwitch({ variantId, isActive, title }: Target & {
  isActive: boolean;
  title: string;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const checked = optimistic ?? isActive;

  return (
    <Switch
      checked={checked}
      disabled={pending}
      aria-label={`${title} available to customers`}
      onCheckedChange={(next) => {
        setOptimistic(next);
        startTransition(async () => {
          toastResult(await setVariantActive({ variantId, isActive: next }));
          setOptimistic(null);
        });
      }}
    />
  );
}
