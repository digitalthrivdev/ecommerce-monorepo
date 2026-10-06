import type { Metadata } from "next";

import { ContactList } from "@/components/site/contact-list";
import { getWebsite } from "@/lib/website";

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getWebsite();
  return { title: "Contact Us", description: `How to reach ${business.name}.` };
}

export default async function ContactPage() {
  const { business } = await getWebsite();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Contact Us</h1>
        <p className="mt-2 text-muted-foreground">
          Questions about an order, a refund or your account? Reach {business.name} here. You can also find your orders and
          their status in the {business.appName} app.
        </p>
      </div>
      <ContactList business={business} />
    </div>
  );
}
