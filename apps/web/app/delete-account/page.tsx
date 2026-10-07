import type { Metadata } from "next";

import { ContactList } from "@/components/contact-list";
import { PageTitle } from "@/components/page-title";
import { getWebsite } from "@/lib/website";

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getWebsite();
  return { title: "Delete Your Account", description: `How to delete your ${business.appName} account and what happens to your data.` };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="flex flex-col gap-3 leading-7 text-foreground/85">{children}</div>
    </section>
  );
}

/** Linked from the app store listings, which require a web page for account deletion. */
export default async function DeleteAccountPage() {
  const { business, apps } = await getWebsite();
  const mailto = business.email
    ? `mailto:${business.email}?subject=${encodeURIComponent(`Delete my ${business.appName} account`)}&body=${encodeURIComponent("Please delete my account. My registered phone number is: ")}`
    : null;

  return (
    <>
      <PageTitle eyebrow="Your data" title="Delete Your Account">
        You can delete your {business.appName} account at any time, in the app or by asking us.
      </PageTitle>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-12">
        <Section title="In the app">
          <ol className="list-decimal space-y-1 pl-6">
            <li>Open the {business.appName} app and log in with your phone number.</li>
            <li>Open the Account tab and tap your name at the top to open Your profile.</li>
            <li>Scroll to the bottom and tap Delete account.</li>
            <li>Read what is deleted, type DELETE and tap Delete my account. You are logged out and the account is deleted straight away.</li>
          </ol>
          {apps.delivery && (
            <p>
              Delivery partners: in the {business.appName} Delivery app, open the Profile tab, scroll to the bottom and tap Delete account
              below the version number, then type DELETE to confirm.
            </p>
          )}
          <p>
            If an order or delivery is still in progress, finish it first. Delivery partners also need to hand over any cash they
            hold from cash-on-delivery orders.
          </p>
        </Section>

        <Section title="Without the app">
          <p>
            {mailto ? (
              <>
                <a href={mailto} className="font-medium text-primary-ink underline underline-offset-4">
                  Email us
                </a>{" "}
                or call us
              </>
            ) : (
              "Contact us"
            )}{" "}
            from the phone number you registered with, and ask us to delete your account. We confirm it is your account and delete it
            within 7 days.
          </p>
          <ContactList business={business} />
        </Section>

        <Section title="What is deleted">
          <ul className="list-disc space-y-1 pl-6">
            <li>Your name, email address and phone number.</li>
            <li>Your saved addresses and your cart.</li>
            <li>The devices registered for notifications. You are logged out everywhere.</li>
            {apps.delivery && <li>For delivery partners, your vehicle details.</li>}
          </ul>
        </Section>

        <Section title="What we keep, and for how long">
          <p>
            Records of orders you placed (items, prices, payments, refunds, invoices, and the name and delivery address on each order)
            are kept for as long as tax and accounting laws require, currently up to 8 years. For delivery partners, records of
            deliveries, cash deposits and payouts are kept for the same reason. They are not used for anything else.
          </p>
          <p>You can sign up again later with the same phone number; it starts as a new account without your old history.</p>
        </Section>
      </div>
    </>
  );
}
