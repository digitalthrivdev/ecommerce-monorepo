import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import type { PlatformSettings } from "@/lib/types";

export const metadata: Metadata = { title: "Settings" };

function ColorSwatch({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="size-4 rounded border" style={{ backgroundColor: color }} aria-hidden />
      <span className="font-mono text-xs">{color}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default async function SettingsPage() {
  await requireAdmin();
  const [settings, deployment] = await Promise.all([apiFetch<PlatformSettings>("/settings/platform"), getPublicSettings()]);

  const rows: [string, React.ReactNode][] = [
    ["App name", deployment.appName],
    ["Currency", deployment.currency],
    ["Time zone", deployment.timezone],
    ["Primary color", <ColorSwatch key="primary" label="Primary color" color={deployment.branding.primaryColor} />],
    ["Secondary color", <ColorSwatch key="secondary" label="Secondary color" color={deployment.branding.secondaryColor} />],
    [
      "Logo",
      deployment.branding.logoUrl ? (
        <a key="logo" href={deployment.branding.logoUrl} target="_blank" rel="noopener noreferrer" className="break-all underline-offset-4 hover:underline">
          {deployment.branding.logoUrl}
        </a>
      ) : (
        "Not set"
      ),
    ],
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
          </CardContent>
        </Card>
      </div>
    </>
  );
}
