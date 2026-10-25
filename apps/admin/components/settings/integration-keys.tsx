"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

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
import { Pill } from "@/components/status-pill";
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

function SecretFieldInput({
  id,
  name,
  hint,
  optional,
  error,
}: {
  id: string;
  name: string;
  hint?: string | null;
  optional?: boolean;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  const [value, setValue] = useState("");

  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={hint ? `Saved, ${hint}` : undefined}
        autoComplete="new-password"
        spellCheck={false}
        maxLength={512}
        required={!optional && !hint}
        aria-invalid={Boolean(error)}
        className="pr-10"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setShow((prev) => !prev)}
        className="absolute right-0.5 top-1/2 -translate-y-1/2 z-10 text-muted-foreground hover:text-foreground"
        aria-label={show ? "Hide value" : "Show value"}
      >
        {show ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  );
}

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
              Copy these from your {item.label} account. We check them with {item.label} and store them safely;
              secret values can be replaced but are never shown again.
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
                  ) : field.secret ? (
                    <SecretFieldInput
                      id={id}
                      name={field.key}
                      hint={field.hint}
                      optional={field.optional}
                      error={error}
                    />
                  ) : (
                    <Input
                      id={id}
                      name={field.key}
                      type="text"
                      defaultValue={field.value ?? ""}
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={512}
                      required={!field.optional}
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
  if (item.source === "env") return <Pill tone="blue">Set on server</Pill>;
  if (item.configured) return <Pill tone="green">Added</Pill>;
  if (item.savedKeysUnreadable) return <Pill tone="red">Enter keys again</Pill>;
  return <Pill tone="gray">Not added</Pill>;
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
          Keys can&apos;t be saved here yet. Ask your technical partner to set <code>SECRETS_ENCRYPTION_KEY</code> on
          the server (for example from <code>openssl rand -base64 32</code>) and restart it.
        </p>
      )}
      <ul className="flex flex-col divide-y">
        {items.map((item) => {
          const publicId = item.fields.find((field) => !field.secret && !field.options)?.value;
          return (
            <li key={item.name} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{item.label}</span>
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
                    ? `Set on the server${publicId ? ` (${publicId})` : ""}. Change them there.`
                    : item.source === "dashboard"
                      ? `${publicId ?? "Keys saved"}${item.keysUpdatedAt ? ` · updated ${formatDateTime(item.keysUpdatedAt, timezone)}` : ""}`
                      : "Not added yet."}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
