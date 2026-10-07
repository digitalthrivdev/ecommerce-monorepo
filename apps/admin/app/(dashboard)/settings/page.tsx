import type { Metadata } from "next";
import Link from "next/link";

import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { PageTabs } from "@/components/page-tabs";
import { PageBody, Panel, Section } from "@/components/section";
import { GatewayKeys } from "@/components/settings/gateway-keys";
import { PaymentGatewayForm } from "@/components/settings/payment-gateway-form";
import { ReviewLoginForm } from "@/components/settings/review-login-form";
import { SettingsForm } from "@/components/settings/settings-form";
import { SmsProviderForm, SmsProviderKeys } from "@/components/settings/sms-provider-form";
import { AppLinksForm, PolicyEditors, PolicyLinks, WebsiteDetailsForm } from "@/components/settings/website-settings";
import { apiFetch } from "@/lib/api";
import { getPublicSettings, requireAdmin } from "@/lib/dal";
import { formatDateTime } from "@/lib/format";
import type { EditablePolicyPage, PlatformSettings } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getSiteUrl } from "@/lib/website";

export const metadata: Metadata = { title: "Settings" };

const TABS = ["rules", "payments", "sms", "website", "about"] as const;
type Tab = (typeof TABS)[number];

function Dot({ ok }: { ok: boolean }) {
  return <span className={cn("size-2 rounded-full", ok ? "bg-green-600" : "bg-amber-500")} role="img" aria-label={ok ? "Working" : "Needs attention"} />;
}

function PaymentsStatus({ settings }: { settings: PlatformSettings }) {
  const active = settings.paymentGateways.find((gateway) => gateway.name === settings.paymentProvider);
  if (!settings.paymentProvider) {
    return (
      <Notice tone="info" title="Online payments are off">
        Customers can only pay cash on delivery. Follow the two steps below to take UPI and card payments.
      </Notice>
    );
  }
  if (!active?.configured) {
    return (
      <Notice tone="danger" title={`${active?.label ?? settings.paymentProvider} has no working keys`}>
        Online payments are off until you add its keys again or choose another option.
      </Notice>
    );
  }
  return active.testMode ? (
    <Notice tone="warning" title={`${active.label} is on, in test mode`}>
      No real money is taken. Switch to live keys from your {active.label} account before opening to customers.
    </Notice>
  ) : (
    <Notice tone="success" title={`Customers pay online through ${active.label}`}>
      Cash on delivery stays available too.
    </Notice>
  );
}

function SmsStatus({ settings }: { settings: PlatformSettings }) {
  const { sms } = settings;
  const active = sms.providers.find((provider) => provider.name === sms.active);
  if (sms.environmentOverride) {
    return (
      <Notice tone="info" title="Set on the server">
        The server setting OTP_PROVIDER={sms.environmentOverride} decides how codes are sent, so the choice below is ignored.
        Ask whoever runs your server to remove it if you want to choose here.
      </Notice>
    );
  }
  if (active) {
    return (
      <Notice tone="success" title={`Sign-in codes are sent by ${active.label}`}>
        Customers, staff and riders get a text message with their code.
      </Notice>
    );
  }
  return sms.fallback === "nobody" ? (
    <Notice tone="danger" title="Customers cannot sign in yet">
      No SMS service is set up, so sign-in codes are not sent. Follow the two steps below.
    </Notice>
  ) : (
    <Notice tone="warning" title="Codes are not sent by SMS yet">
      For testing, codes are written to the server log. Set up an SMS service before opening to customers.
    </Notice>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  await requireAdmin();
  const { tab: tabParam } = await searchParams;
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "rules";
  const [settings, deployment, policyPages] = await Promise.all([
    apiFetch<PlatformSettings>("/settings/platform"),
    getPublicSettings(),
    tab === "website" ? apiFetch<EditablePolicyPage[]>("/settings/policy-pages") : null,
  ]);
  const siteUrl = getSiteUrl();
  const siteLinks = [
    { title: "Website", url: siteUrl },
    ...(policyPages ?? []).map((page) => ({ title: page.title, url: `${siteUrl}/${page.slug}` })),
    { title: "Contact Us", url: `${siteUrl}/contact` },
    ...(settings.deliveryPlayStoreUrl || settings.deliveryAppStoreUrl || settings.deliveryDownloadUrl
      ? [{ title: "Delivery partner app", url: `${siteUrl}/partner` }]
      : []),
  ];

  const activeGateway = settings.paymentGateways.find((gateway) => gateway.name === settings.paymentProvider);
  const paymentsOk = Boolean(activeGateway?.configured && !activeGateway.testMode);
  const smsOk = Boolean(settings.sms.active);
  const lastSaved = settings.updatedById ? formatDateTime(settings.updatedAt, deployment.timezone) : null;

  return (
    <>
      <PageHeader title="Settings" description="How your shop charges, takes payments and signs people in" />

      <PageBody narrow className="max-w-3xl gap-6 pb-0">
        <PageTabs
          label="Settings sections"
          active={tab}
          tabs={[
            { id: "rules", label: "Shop rules", href: "/settings" },
            { id: "payments", label: "Online payments", href: "/settings?tab=payments", badge: <Dot ok={paymentsOk} /> },
            { id: "sms", label: "SMS sign-in", href: "/settings?tab=sms", badge: <Dot ok={smsOk} /> },
            { id: "website", label: "Website", href: "/settings?tab=website" },
            { id: "about", label: "About this setup", href: "/settings?tab=about" },
          ]}
        />

        {tab === "rules" && <SettingsForm key={settings.updatedAt} settings={settings} currency={deployment.currency} />}

        {tab === "payments" && (
          <div className="flex flex-col gap-8 pb-12">
            <PaymentsStatus settings={settings} />
            <Section step={1} title="Add your payment account keys" hint="Copy them from your Razorpay or Cashfree account. They are stored safely and never shown again.">
              <Panel className="p-5">
                <GatewayKeys
                  gateways={settings.paymentGateways}
                  activeGateway={settings.paymentProvider}
                  canStore={settings.canStoreSecrets}
                  timezone={deployment.timezone}
                />
              </Panel>
            </Section>
            <Section step={2} title="Choose how customers pay online" hint="Only options with keys can be chosen.">
              <Panel className="p-5">
                <PaymentGatewayForm
                  key={`${settings.updatedAt}-${settings.paymentGateways.map((gateway) => `${gateway.name}:${gateway.configured}`).join()}`}
                  settings={settings}
                />
              </Panel>
            </Section>
          </div>
        )}

        {tab === "sms" && (
          <div className="flex flex-col gap-8 pb-12">
            <SmsStatus settings={settings} />
            <Section step={1} title="Add your SMS account details" hint="From your SMS provider's website. Passwords are stored safely and never shown again.">
              <Panel className="p-5">
                <SmsProviderKeys sms={settings.sms} canStore={settings.canStoreSecrets} timezone={deployment.timezone} />
              </Panel>
            </Section>
            <Section step={2} title="Choose who sends sign-in codes">
              <Panel className="p-5">
                <SmsProviderForm
                  key={`${settings.updatedAt}-${settings.sms.providers.map((provider) => `${provider.name}:${provider.configured}`).join()}`}
                  sms={settings.sms}
                />
              </Panel>
            </Section>
            <Section
              title="Review login"
              hint="Google Play and payment gateways test the app before approving it. Give them this number and code."
            >
              <Panel className="p-5">
                <ReviewLoginForm key={settings.updatedAt} reviewLogin={settings.reviewLogin} />
              </Panel>
            </Section>
          </div>
        )}

        {tab === "website" && policyPages && (
          <div className="flex flex-col gap-8 pb-12">
            <Notice tone="info" title="Your public website">
              A home page plus the policy pages Razorpay, Cashfree and Google Play ask for, at{" "}
              <a href={siteUrl} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-4">
                {siteUrl.replace(/^https?:\/\//, "")}
              </a>
              . The home page shows the banners and categories from{" "}
              <Link href="/appearance" className="font-medium underline underline-offset-4">
                Appearance
              </Link>
              , like the app. Each policy starts from a template written for how this app works; read it and change anything that
              doesn’t match your business, ideally with a legal adviser.
            </Notice>
            <Section step={1} title="Your business and home page" hint="Shown on the home page, every policy page and the contact page.">
              <Panel className="p-5">
                <WebsiteDetailsForm key={settings.updatedAt} settings={settings} />
              </Panel>
            </Section>
            <Section step={2} title="Where to get the apps" hint="Download buttons appear only for the links you add.">
              <Panel className="p-5">
                <AppLinksForm key={settings.updatedAt} settings={settings} />
              </Panel>
            </Section>
            <Section step={3} title="Check the policy pages" hint="Open a page to read or change it.">
              <PolicyEditors pages={policyPages} siteUrl={siteUrl} timezone={deployment.timezone} />
            </Section>
            <Section step={4} title="Share the links" hint="Paste these where you are asked for a website, privacy policy or terms.">
              <Panel>
                <PolicyLinks links={siteLinks} />
              </Panel>
            </Section>
          </div>
        )}

        {tab === "about" && (
          <div className="flex flex-col gap-8 pb-12">
            <Section title="Fixed for this setup" hint="Set when your shop was installed. Changing these needs your technical partner.">
              <Panel className="divide-y">
                {[
                  ["Currency", deployment.currency],
                  ["Time zone", deployment.timezone],
                  ["Settings last saved", lastSaved ?? "Never, using the starting values"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </Panel>
            </Section>
            <p className="text-sm text-muted-foreground">
              Your shop name, logo, colours and the app home screen are changed on the{" "}
              <Link href="/appearance" className="font-medium text-primary-ink underline underline-offset-4">
                Appearance
              </Link>{" "}
              page.
            </p>
          </div>
        )}
      </PageBody>
    </>
  );
}
