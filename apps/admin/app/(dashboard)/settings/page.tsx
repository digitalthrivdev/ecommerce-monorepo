import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import type { PlatformSettings } from "@/lib/types";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, deployment] = await Promise.all([apiFetch<PlatformSettings>("/settings/platform"), getPublicSettings()]);

  const rows: [string, string][] = [
    ["Currency", deployment.currency],
    ["Time zone", deployment.timezone],
  ];

  return (
    <>
      <PageHeader title="Settings" description="Charges, partner payouts and support contacts" />

      <div className="grid items-start gap-4 p-4 md:p-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Platform settings</CardTitle>
            <CardDescription>
              {settings.updatedById
                ? `Last saved ${formatDateTime(settings.updatedAt, deployment.timezone)}.`
                : "Using the server defaults. Saving keeps your values from now on."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsForm key={settings.updatedAt} settings={settings} currency={deployment.currency} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Deployment</CardTitle>
            <CardDescription>Set through environment variables for this client&apos;s deployment. Changing them needs a redeploy.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm text-muted-foreground">
              The app name, logo, colours and home screen are edited on the{" "}
              <Link href="/appearance" className="font-medium text-foreground underline-offset-4 hover:underline">
                Appearance
              </Link>{" "}
              page.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
