"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { adjustStock, setAvailability } from "@/app/(dashboard)/inventory/actions";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toastResult } from "@/lib/action-toast";

type Target = { storeId: string; productId: string };
type Mode = "add" | "remove" | "set";

const MODE_COPY: Record<Mode, { label: string; field: string; hint: string }> = {
  add: { label: "Add stock", field: "Quantity received", hint: "Use when new stock arrives." },
  remove: { label: "Remove", field: "Quantity to remove", hint: "Use for damaged, expired or missing items." },
  set: { label: "Set count", field: "Counted quantity", hint: "Use after a physical stock count. Replaces the current quantity." },
};

export function StockAdjustDialog({ storeId, productId, productName, currentStock }: Target & {
  productName: string;
  currentStock: number;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("add");
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();

  const value = Number(amount);
  const valid = amount !== "" && Number.isInteger(value) && value >= 0 && (mode === "set" || value > 0);
  const preview = !valid ? null : mode === "add" ? currentStock + value : mode === "remove" ? currentStock - value : value;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setMode("add");
      setAmount("");
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      if (toastResult(await adjustStock({ storeId, productId, mode, amount }))) {
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
              {productName} · {currentStock} in stock
            </DialogDescription>
          </DialogHeader>
          <Tabs value={mode} onValueChange={(next) => setMode(next as Mode)}>
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

export function AvailabilitySwitch({ storeId, productId, isAvailable, productName }: Target & {
  isAvailable: boolean;
  productName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const checked = optimistic ?? isAvailable;

  return (
    <Switch
      checked={checked}
      disabled={pending}
      aria-label={`${productName} available to customers`}
      onCheckedChange={(next) => {
        setOptimistic(next);
        startTransition(async () => {
          toastResult(await setAvailability({ storeId, productId, isAvailable: next }));
          setOptimistic(null);
        });
      }}
    />
  );
}
