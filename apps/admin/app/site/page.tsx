import type { Metadata } from "next";
import { MapPin, PackageCheck, ShoppingBasket, Smartphone, Truck } from "lucide-react";

import { ContactList } from "@/components/site/contact-list";
import { getWebsite } from "@/lib/website";

export async function generateMetadata(): Promise<Metadata> {
  const { business, tagline } = await getWebsite();
  return { title: { absolute: business.appName }, description: tagline ?? `${business.appName}: groceries and daily essentials delivered to your door.` };
}

const STEPS = [
  { icon: ShoppingBasket, title: "Order in the app", text: "Fruits, vegetables, dairy, snacks and household essentials at store prices." },
  { icon: PackageCheck, title: "Packed nearby", text: "Your order is picked and packed at the nearest store that has everything in stock." },
  { icon: Truck, title: "Delivered to your door", text: "Follow your delivery partner live and pay online or with cash on delivery." },
];

export default async function HomePage() {
  const { business, tagline, playStoreUrl, cities } = await getWebsite();

  return (
    <>
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-5 py-16 sm:py-24">
          <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">{business.appName}</h1>
          <p className="max-w-xl text-lg opacity-90 sm:text-xl">
            {tagline ?? "Groceries and daily essentials, delivered to your door in minutes."}
          </p>
          {playStoreUrl && (
            <a
              href={playStoreUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2.5 rounded-xl bg-background px-5 py-3 font-semibold text-foreground shadow-sm hover:opacity-90"
            >
              <Smartphone className="size-5" aria-hidden />
              Get the app on Google Play
            </a>
          )}
          {cities.length > 0 && (
            <p className="flex items-center gap-2 text-sm opacity-90">
              <MapPin className="size-4" aria-hidden />
              Now delivering in {cities.join(", ")}
            </p>
          )}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-14 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex flex-col gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary-ink">
              <Icon className="size-5" aria-hidden />
            </span>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 pb-16">
        <h2 className="text-2xl font-bold tracking-tight">Get in touch</h2>
        <div className="max-w-2xl">
          <ContactList business={business} />
        </div>
      </section>
    </>
  );
}
