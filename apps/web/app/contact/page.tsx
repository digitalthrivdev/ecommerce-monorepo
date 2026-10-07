import type { Metadata } from "next";

import { ContactList } from "@/components/contact-list";
import { PageTitle } from "@/components/page-title";
import { getWebsite } from "@/lib/website";

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getWebsite();
  return { title: "Contact Us", description: `How to reach ${business.name}.` };
}

export default async function ContactPage() {
  const { business } = await getWebsite();

  return (
    <>
      <PageTitle eyebrow="We're here to help" title="Contact Us">
        Questions about an order, a refund or your account? Reach {business.name} here. You can also find your orders and their status in the{" "}
        {business.appName} app.
      </PageTitle>
      <div className="mx-auto w-full max-w-3xl px-5 py-12">
        <ContactList business={business} />
      </div>
    </>
  );
}
