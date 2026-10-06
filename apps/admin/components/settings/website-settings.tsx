"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { restorePolicyTemplate, savePolicyPage, updateWebsiteDetails } from "@/app/(dashboard)/settings/actions";
import { Pill } from "@/components/status-pill";
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
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFormAction } from "@/hooks/use-form-action";
import { toastResult } from "@/lib/action-toast";
import { formatDateTime } from "@/lib/format";
import type { EditablePolicyPage, PlatformSettings } from "@/lib/types";

export function WebsiteDetailsForm({ settings }: { settings: PlatformSettings }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(updateWebsiteDetails);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <FieldGroup>
        <Field data-invalid={Boolean(fieldErrors.websiteTagline)}>
          <FieldLabel htmlFor="website-tagline">Tagline on the home page</FieldLabel>
          <Input
            id="website-tagline"
            name="websiteTagline"
            defaultValue={settings.websiteTagline ?? ""}
            maxLength={160}
            placeholder="Groceries and daily essentials, delivered to your door in minutes."
            aria-invalid={Boolean(fieldErrors.websiteTagline)}
          />
          <FieldDescription>Leave empty to use the line shown above.</FieldDescription>
          <FieldError>{fieldErrors.websiteTagline}</FieldError>
        </Field>
        <Field data-invalid={Boolean(fieldErrors.playStoreUrl)}>
          <FieldLabel htmlFor="play-store-url">Customer app on Google Play</FieldLabel>
          <Input
            id="play-store-url"
            name="playStoreUrl"
            type="url"
            defaultValue={settings.playStoreUrl ?? ""}
            maxLength={300}
            placeholder="https://play.google.com/store/apps/details?id=…"
            aria-invalid={Boolean(fieldErrors.playStoreUrl)}
          />
          <FieldDescription>Adds a download button to the home page. Add it once the app is published.</FieldDescription>
          <FieldError>{fieldErrors.playStoreUrl}</FieldError>
        </Field>
        <Field data-invalid={Boolean(fieldErrors.businessName)}>
          <FieldLabel htmlFor="business-name">Registered business name</FieldLabel>
          <Input
            id="business-name"
            name="businessName"
            defaultValue={settings.businessName ?? ""}
            maxLength={200}
            placeholder="Acme Retail Private Limited"
            aria-invalid={Boolean(fieldErrors.businessName)}
          />
          <FieldDescription>As on your GST or company registration. Leave empty to use the app name.</FieldDescription>
          <FieldError>{fieldErrors.businessName}</FieldError>
        </Field>
        <Field data-invalid={Boolean(fieldErrors.businessAddress)}>
          <FieldLabel htmlFor="business-address">Registered address</FieldLabel>
          <Textarea
            id="business-address"
            name="businessAddress"
            defaultValue={settings.businessAddress ?? ""}
            maxLength={500}
            rows={3}
            placeholder={"Shop 4, Main Road\nAndheri East, Mumbai 400069"}
            aria-invalid={Boolean(fieldErrors.businessAddress)}
          />
          <FieldError>{fieldErrors.businessAddress}</FieldError>
        </Field>
      </FieldGroup>
      <p className="text-sm text-muted-foreground">
        The phone number and email on the pages come from the customer help line in{" "}
        <Link href="/settings" className="font-medium text-primary-ink underline underline-offset-4">
          Shop rules
        </Link>
        {settings.supportPhone || settings.supportEmail ? "." : ", which is empty right now. Payment gateways need at least one."}
      </p>
      <div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save website details
        </Button>
      </div>
    </form>
  );
}

function RestoreTemplateButton({ page }: { page: EditablePolicyPage }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      if (toastResult(await restorePolicyTemplate({ slug: page.slug }))) setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost">
          Restore template
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Go back to the template?</AlertDialogTitle>
          <AlertDialogDescription>Your changes to the {page.title} are deleted and the page shows the starting text again.</AlertDialogDescription>
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
            Restore template
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PolicyEditor({ page, siteUrl, timezone }: { page: EditablePolicyPage; siteUrl: string; timezone: string }) {
  const { pending, fieldErrors, onSubmit } = useFormAction(savePolicyPage);
  const id = `policy-${page.slug}`;

  return (
    <details className="group rounded-xl border bg-card shadow-xs">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold">{page.title}</span>
        {page.custom ? <Pill tone="green">Edited</Pill> : <Pill tone="gray">Template</Pill>}
        <span className="ml-auto text-sm text-primary-ink group-open:hidden">Edit</span>
      </summary>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 border-t px-5 py-4">
        <input type="hidden" name="slug" value={page.slug} />
        <Field data-invalid={Boolean(fieldErrors.body)}>
          <FieldLabel htmlFor={id} className="sr-only">
            {page.title} text
          </FieldLabel>
          <Textarea
            id={id}
            name="body"
            defaultValue={page.body}
            required
            maxLength={50_000}
            spellCheck
            className="field-sizing-fixed h-[28rem] font-mono text-[13px] leading-6"
            aria-invalid={Boolean(fieldErrors.body)}
          />
          <FieldDescription>
            Start a line with <code>## </code> for a heading or <code>- </code> for a list item; leave a blank line between
            paragraphs. <code>{"{{appName}}"}</code>, <code>{"{{businessName}}"}</code> and <code>{"{{contact}}"}</code> are
            filled in from your settings.
          </FieldDescription>
          <FieldError>{fieldErrors.body}</FieldError>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Save page
          </Button>
          {page.custom && <RestoreTemplateButton page={page} />}
          <Button asChild variant="ghost">
            <a href={`${siteUrl}/${page.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink />
              View page
            </a>
          </Button>
          {page.updatedAt && <span className="ml-auto text-sm text-muted-foreground">Saved {formatDateTime(page.updatedAt, timezone)}</span>}
        </div>
      </form>
    </details>
  );
}

export function PolicyEditors({ pages, siteUrl, timezone }: { pages: EditablePolicyPage[]; siteUrl: string; timezone: string }) {
  return (
    <div className="flex flex-col gap-3">
      {pages.map((page) => (
        <PolicyEditor key={`${page.slug}-${page.updatedAt}`} page={page} siteUrl={siteUrl} timezone={timezone} />
      ))}
    </div>
  );
}

export function PolicyLinks({ links }: { links: { title: string; url: string }[] }) {
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy. Select the link and copy it instead.");
    }
  }

  return (
    <ul className="divide-y">
      {links.map((link) => (
        <li key={link.url} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
          <span className="w-44 shrink-0 font-medium">{link.title}</span>
          <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-primary-ink underline-offset-4 hover:underline">
            {link.url}
          </a>
          <Button type="button" variant="ghost" size="icon" onClick={() => copy(link.url)} aria-label={`Copy the ${link.title} link`}>
            <Copy />
          </Button>
        </li>
      ))}
    </ul>
  );
}
