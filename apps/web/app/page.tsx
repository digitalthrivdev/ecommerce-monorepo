import type { Metadata } from "next";
import Link from "next/link";
import { Bell, ReceiptText, ShieldCheck, ShoppingBasket, PackageCheck, Truck, Wallet } from "lucide-react";

import { AppBadges } from "@/components/app-badges";
import { HomeSections, shownSections } from "@/components/home-sections";
import { PhonePreview } from "@/components/phone-preview";
import { QrCode } from "@/components/qr-code";
import { getHomeFeed, getSettings, getSiteUrl, getWebsite } from "@/lib/website";

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getWebsite();
  return { title: { absolute: `${business.appName}: groceries delivered to your door` } };
}

const STEPS = [
  { icon: ShoppingBasket, title: "Order in the app", text: "Browse fruits, vegetables, dairy, snacks and household essentials, and check out in a few taps." },
  { icon: PackageCheck, title: "Packed with care", text: "We pick and pack your order as soon as it comes in, checking every item." },
  { icon: Truck, title: "Delivered to your door", text: "Follow every step in the app, from packing to your doorstep." },
];

export default async function HomePage() {
  const [website, settings, feed, siteUrl] = await Promise.all([getWebsite(), getSettings(), getHomeFeed().catch(() => null), getSiteUrl()]);
  const { business, tagline, apps } = website;
  const sections = feed ? shownSections(feed) : [];
  const payOnline = settings.payments.methods.includes("ONLINE");

  const features = [
    { icon: ShieldCheck, title: "Quality checked", text: "Every order checked before it leaves" },
    { icon: Wallet, title: payOnline ? "Pay online or cash" : "Cash on delivery", text: payOnline ? "UPI, cards, or cash at the door" : "Pay when your order arrives" },
    { icon: Bell, title: "Order updates", text: "Know when it's packed and on its way" },
    { icon: ReceiptText, title: "GST invoice", text: "Download it from the app after delivery" },
  ];

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary to-primary-deep text-primary-foreground">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:22px_22px]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pt-14 pb-28 lg:grid-cols-[1.15fr_0.85fr] lg:pt-20 lg:pb-32">
          <div className="flex flex-col items-start gap-6">
            <h1 className="max-w-xl text-4xl leading-[1.08] font-extrabold sm:text-5xl lg:text-6xl">
              {tagline ?? "Groceries and daily essentials, delivered to your door"}
            </h1>
            <p className="max-w-lg text-lg opacity-90">
              Fresh fruits, vegetables, dairy and household needs from {business.appName}, packed with care and brought to your door.
            </p>

            {apps.customer ? (
              <div className="flex flex-wrap items-center gap-6">
                <AppBadges links={apps.customer} appName={business.appName} />
                <div className="hidden items-center gap-3 rounded-2xl bg-white p-2.5 pr-4 text-neutral-900 shadow-lg lg:flex">
                  <QrCode value={`${siteUrl}/app`} label={`QR code to download the ${business.appName} app`} className="size-16" />
                  <p className="text-xs leading-snug font-semibold">
                    Scan to get
                    <br />
                    the app
                  </p>
                </div>
              </div>
            ) : (
              <Link href="/contact" className="inline-flex h-12 items-center rounded-full bg-white px-6 font-semibold text-neutral-900 shadow-md transition hover:opacity-90">
                Contact us
              </Link>
            )}
          </div>

          <PhonePreview appName={business.appName} logoUrl={business.logoUrl} sections={sections} />
        </div>
      </section>

      <section aria-label="Why order with us" className="relative z-10 mx-auto -mt-16 w-full max-w-6xl px-5">
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border bg-border shadow-xl shadow-black/5 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex flex-col gap-3 bg-card p-5 sm:flex-row sm:items-center sm:p-6">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-ink">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {sections.length > 0 && (
        <div id="shop" className="flex scroll-mt-16 flex-col pt-8">
          <HomeSections sections={sections} />
        </div>
      )}

      <section id="how-it-works" className="mt-10 scroll-mt-16 bg-muted">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold tracking-wider text-primary-ink uppercase">How it works</p>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">From our shelves to your door</h2>
          </div>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="relative flex flex-col gap-4 rounded-3xl bg-card p-7 shadow-sm ring-1 ring-black/5">
                <span className="absolute top-6 right-7 text-5xl font-extrabold text-primary/10" aria-hidden>
                  {index + 1}
                </span>
                <span className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                  <Icon className="size-6" aria-hidden />
                </span>
                <h3 className="text-lg font-bold">{title}</h3>
                <p className="text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {apps.customer && (
        <section id="download" className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-20">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-primary-deep px-7 py-12 text-primary-foreground shadow-xl sm:px-12">
            <div aria-hidden className="absolute -top-24 -right-24 size-72 rounded-full bg-white/10" />
            <div aria-hidden className="absolute -bottom-28 right-40 size-56 rounded-full bg-accent/25" />
            <div className="relative flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex max-w-xl flex-col gap-4">
                <h2 className="text-3xl font-extrabold sm:text-4xl">Get the {business.appName} app</h2>
                <p className="text-lg opacity-90">Order in a few taps, track your delivery live, and reorder your regulars any time.</p>
                <AppBadges links={apps.customer} appName={business.appName} className="mt-2" />
              </div>
              <div className="hidden flex-col items-center gap-3 rounded-3xl bg-white p-5 text-neutral-900 shadow-2xl lg:flex">
                <QrCode value={`${siteUrl}/app`} label={`QR code to download the ${business.appName} app`} className="size-36" />
                <p className="text-sm font-semibold">Scan with your phone camera</p>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
