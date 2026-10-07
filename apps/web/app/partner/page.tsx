import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download, KeyRound, Power } from "lucide-react";

import { AppBadges } from "@/components/app-badges";
import { ContactList } from "@/components/contact-list";
import { PageTitle } from "@/components/page-title";
import { getWebsite } from "@/lib/website";

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getWebsite();
  return { title: "Delivery partner app", description: `Download the ${business.appName} delivery partner app.` };
}

const STEPS = [
  { icon: Download, title: "Install the app", text: "Download the partner app from one of the buttons above." },
  { icon: KeyRound, title: "Log in", text: "Use the phone number the store registered for you. A one-time code is sent to it." },
  { icon: Power, title: "Go online", text: "Switch on to receive deliveries, then pick up and deliver with live directions." },
];

export default async function PartnerPage() {
  const { business, apps } = await getWebsite();
  if (!apps.delivery) notFound();

  return (
    <>
      <PageTitle eyebrow="Delivery partners" title={`${business.appName} delivery partner app`}>
        <p>For delivery partners who deliver {business.appName} orders.</p>
        <AppBadges links={apps.delivery} appName={business.appName} className="mt-6" />
      </PageTitle>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-5 py-12">
        <ol className="grid gap-4 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Want to deliver with us?</h2>
          <p className="text-muted-foreground">Get in touch and we will register your number.</p>
          <ContactList business={business} />
        </section>
      </div>
    </>
  );
}
