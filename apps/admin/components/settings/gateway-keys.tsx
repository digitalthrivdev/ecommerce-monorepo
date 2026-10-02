"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { removeGatewayKeys, saveGatewayKeys } from "@/app/(dashboard)/settings/actions";
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
import type { PaymentGatewayOption } from "@/lib/types";

function WebhookSetup({ gateway }: { gateway: PaymentGatewayOption }) {
  if (!gateway.webhookEvents) return null;

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Webhook URL copied");
    } catch {
      toast.error("Could not copy. Select the URL and copy it instead.");
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-muted p-3 text-sm">
      <span className="font-medium">Webhook</span>
      {gateway.webhookUrl ? (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">{gateway.webhookUrl}</code>
          <Button type="button" variant="outline" size="icon-sm" onClick={() => copy(gateway.webhookUrl!)} aria-label="Copy webhook URL">
            <Copy />
          </Button>
        </div>
      ) : (
        <span className="text-muted-foreground">Set PUBLIC_API_URL on the server to see the webhook URL.</span>
      )}
      <span className="text-muted-foreground">
        Add it in the {gateway.label} dashboard with these events: {gateway.webhookEvents}.
      </span>
    </div>
  );
}

function EditKeysDialog({ gateway }: { gateway: PaymentGatewayOption }) {
  const [open, setOpen] = useState(false);
  const { pending, fieldErrors, onSubmit, reset } = useFormAction(saveGatewayKeys, () => setOpen(false));
  const hasSaved = gateway.source === "dashboard";

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
            <DialogTitle>{gateway.label} keys</DialogTitle>
            <DialogDescription>
              Copy these from the {gateway.label} dashboard. They are checked with {gateway.label} and stored encrypted;
              secret keys can be replaced but never shown again.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="gateway" value={gateway.name} />
          <FieldGroup>
            {gateway.fields.map((field) => {
              const id = `gateway-${gateway.name}-${field.key}`;
              const error = fieldErrors[field.key];
              return (
                <Field key={field.key} data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
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
                      required={!field.secret || !field.hint}
                      aria-invalid={Boolean(error)}
                    />
                  )}
                  {field.secret && field.hint && <FieldDescription>Leave blank to keep the saved value.</FieldDescription>}
                  <FieldError>{error}</FieldError>
                </Field>
              );
            })}
          </FieldGroup>
          <WebhookSetup gateway={gateway} />
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

function RemoveKeysButton({ gateway, active }: { gateway: PaymentGatewayOption; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      if (toastResult(await removeGatewayKeys({ gateway: gateway.name }))) setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={active} title={active ? "Choose another gateway first" : undefined}>
          Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove the {gateway.label} keys?</AlertDialogTitle>
          <AlertDialogDescription>
            Payments already taken through {gateway.label} can no longer be confirmed or refunded automatically until
            the keys are added again.
          </AlertDialogDescription>
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

function status(gateway: PaymentGatewayOption) {
  if (gateway.source === "env") return <Badge variant="secondary">Server environment</Badge>;
  if (gateway.configured) return <Badge>{gateway.testMode ? "Test keys" : "Live keys"}</Badge>;
  if (gateway.savedKeysUnreadable) return <Badge variant="destructive">Enter keys again</Badge>;
  return <Badge variant="outline">Not set</Badge>;
}

export function GatewayKeys({
  gateways,
  activeGateway,
  canStore,
  timezone,
}: {
  gateways: PaymentGatewayOption[];
  activeGateway: string | null;
  canStore: boolean;
  timezone: string;
}) {
  const withKeys = gateways.filter((gateway) => gateway.needsCredentials);

  return (
    <div className="flex flex-col gap-4">
      {!canStore && (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">
          To save keys here, set <code>PAYMENT_SECRETS_KEY</code> on the server (for example from{" "}
          <code>openssl rand -base64 32</code>) and restart the API. Until then keys can only be set in the server
          environment.
        </p>
      )}
      <ul className="flex flex-col divide-y">
        {withKeys.map((gateway) => {
          const publicId = gateway.fields.find((field) => !field.secret && !field.options)?.value;
          return (
            <li key={gateway.name} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{gateway.label}</span>
                {status(gateway)}
                <div className="ml-auto flex gap-1">
                  {gateway.source === "dashboard" && (
                    <RemoveKeysButton gateway={gateway} active={activeGateway === gateway.name} />
                  )}
                  {gateway.editable && <EditKeysDialog gateway={gateway} />}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {gateway.savedKeysUnreadable
                  ? "The saved keys cannot be read, probably because PAYMENT_SECRETS_KEY changed. Add them again."
                  : gateway.source === "env"
                    ? `Set in the server environment${publicId ? ` (${publicId})` : ""}. Change them there.`
                    : gateway.source === "dashboard"
                      ? `${publicId ?? "Keys saved"}${gateway.keysUpdatedAt ? ` · updated ${formatDateTime(gateway.keysUpdatedAt, timezone)}` : ""}`
                      : "No keys yet."}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
