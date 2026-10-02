"use client";

import { useState, useTransition, type ReactNode } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormAction } from "@/hooks/use-form-action";
import { toastResult } from "@/lib/action-toast";
import { formatDateTime } from "@/lib/format";
import type { ActionResult, IntegrationKeys } from "@/lib/types";

type Actions = {
  /** Receives the form with a hidden `name` field plus one entry per credential field. */
  save: (formData: FormData) => Promise<ActionResult>;
  remove: (input: { name: string }) => Promise<ActionResult>;
};

function EditKeysDialog<T extends IntegrationKeys>({
  item,
  save,
  children,
}: {
  item: T;
  save: Actions["save"];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(save, () => setOpen(false));
  const hasSaved = item.source === "dashboard";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={hasSaved ? "outline" : "default"} size="sm">
          <KeyRound />
          {hasSaved ? "Edit keys" : "Add keys"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" autoComplete="off">
          <DialogHeader>
            <DialogTitle>{item.label} keys</DialogTitle>
            <DialogDescription>
              Copy these from your {item.label} account. They are checked with {item.label} and stored encrypted;
              secret values can be replaced but never shown again.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="name" value={item.name} />
          <FieldGroup>
            {item.fields.map((field) => {
              const id = `keys-${item.name}-${field.key}`;
              const error = fieldErrors[field.key];
              return (
                <Field key={field.key} data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor={id}>
                    {field.label}
                    {field.optional && <span className="font-normal text-muted-foreground">(optional)</span>}
                  </FieldLabel>
                  {field.options ? (
                    <Select name={field.key} defaultValue={field.value ?? field.options[0]}>
                      <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(error)}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option[0]!.toUpperCase() + option.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={id}
                      name={field.key}
                      type={field.secret ? "password" : "text"}
                      defaultValue={field.secret ? "" : (field.value ?? "")}
                      placeholder={field.secret && field.hint ? `Saved, ${field.hint}` : undefined}
                      autoComplete={field.secret ? "new-password" : "off"}
                      spellCheck={false}
                      maxLength={512}
                      required={!field.optional && (!field.secret || !field.hint)}
                      aria-invalid={Boolean(error)}
                    />
                  )}
                  {(field.help || (field.secret && field.hint)) && (
                    <FieldDescription>
                      {[field.help, field.secret && field.hint ? "Leave blank to keep the saved value." : null]
                        .filter(Boolean)
                        .join(" ")}
                    </FieldDescription>
                  )}
                  <FieldError>{error}</FieldError>
                </Field>
              );
            })}
          </FieldGroup>
          {children}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {pending ? "Checking keys" : "Save keys"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveKeysButton<T extends IntegrationKeys>({
  item,
  active,
  remove,
  warning,
}: {
  item: T;
  active: boolean;
  remove: Actions["remove"];
  warning: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      if (toastResult(await remove({ name: item.name }))) setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={active} title={active ? "Choose another one first" : undefined}>
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove the {item.label} keys?</AlertDialogTitle>
          <AlertDialogDescription>{warning}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              confirm();
            }}
          >
            {pending && <Loader2 className="animate-spin" />}
            Remove keys
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function defaultStatus(item: IntegrationKeys) {
  if (item.source === "env") return <Badge variant="secondary">Server environment</Badge>;
  if (item.configured) return <Badge>Keys saved</Badge>;
  if (item.savedKeysUnreadable) return <Badge variant="destructive">Enter keys again</Badge>;
  return <Badge variant="outline">Not set</Badge>;
}

/** Keys for each payment gateway or SMS provider: add, edit (write-only secrets) and remove. */
export function IntegrationKeysList<T extends IntegrationKeys>({
  items,
  active,
  canStore,
  timezone,
  save,
  remove,
  removeWarning,
  status = defaultStatus,
  dialogExtra,
}: Actions & {
  items: T[];
  active: string | null;
  canStore: boolean;
  timezone: string;
  removeWarning: (item: T) => string;
  status?: (item: T) => ReactNode;
  /** Shown in the edit dialog under the fields, e.g. webhook setup steps. */
  dialogExtra?: (item: T) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {!canStore && (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">
          To save keys here, set <code>SECRETS_ENCRYPTION_KEY</code> on the server (for example from{" "}
          <code>openssl rand -base64 32</code>) and restart the API. Until then keys can only be set in the server
          environment.
        </p>
      )}
      <ul className="flex flex-col divide-y">
        {items.map((item) => {
          const publicId = item.fields.find((field) => !field.secret && !field.options)?.value;
          return (
            <li key={item.name} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{item.label}</span>
                {status(item)}
                <div className="ml-auto flex gap-1">
                  {item.source === "dashboard" && (
                    <RemoveKeysButton item={item} active={active === item.name} remove={remove} warning={removeWarning(item)} />
                  )}
                  {item.editable && (
                    <EditKeysDialog item={item} save={save}>
                      {dialogExtra?.(item)}
                    </EditKeysDialog>
                  )}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {item.savedKeysUnreadable
                  ? "The saved keys cannot be read, probably because SECRETS_ENCRYPTION_KEY changed. Add them again."
                  : item.source === "env"
                    ? `Set in the server environment${publicId ? ` (${publicId})` : ""}. Change them there.`
                    : item.source === "dashboard"
                      ? `${publicId ?? "Keys saved"}${item.keysUpdatedAt ? ` · updated ${formatDateTime(item.keysUpdatedAt, timezone)}` : ""}`
                      : "No keys yet."}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
