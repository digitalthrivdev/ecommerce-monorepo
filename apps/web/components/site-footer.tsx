import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";

import { AppBadges } from "@/components/app-badges";
import { BrandMark } from "@/components/brand-mark";
import type { Website } from "@/lib/types";
import { sitePages } from "@/lib/website";

export function SiteFooter({ website }: { website: Website }) {
  const { business, apps, pages } = website;

  return (
    <footer className="bg-[oklch(0.18_0.01_70)] text-white/70">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-white">
            <BrandMark appName={business.appName} logoUrl={business.logoUrl} />
            <span className="text-lg tracking-tight">{business.appName}</span>
          </Link>
          <p className="max-w-sm text-sm leading-6">Groceries and daily essentials from {business.appName}, delivered to your door.</p>
          {apps.customer && <AppBadges links={apps.customer} appName={business.appName} className="mt-2 [&_a]:h-12 [&_a]:min-w-40" />}
        </div>

        <nav aria-label="Policies" className="flex flex-col gap-3 text-sm">
          <h2 className="mb-1 text-xs font-semibold tracking-wider text-white uppercase">Policies</h2>
          {sitePages(pages).map((page) => (
            <Link key={page.path} href={page.path} className="hover:text-white">
              {page.title}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-3 text-sm">
          <h2 className="mb-1 text-xs font-semibold tracking-wider text-white uppercase">Get in touch</h2>
          {business.phone && (
            <a href={`tel:${business.phone}`} className="flex items-center gap-2.5 hover:text-white">
              <Phone className="size-4 shrink-0" aria-hidden />
              {business.phone}
            </a>
          )}
          {business.email && (
            <a href={`mailto:${business.email}`} className="flex items-center gap-2.5 break-all hover:text-white">
              <Mail className="size-4 shrink-0" aria-hidden />
              {business.email}
            </a>
          )}
          {business.address && (
            <p className="flex gap-2.5 leading-6 whitespace-pre-line">
              <MapPin className="mt-1 size-4 shrink-0" aria-hidden />
              {business.address}
            </p>
          )}
          {!business.phone && !business.email && !business.address && (
            <Link href="/contact" className="hover:text-white">
              Contact us
            </Link>
          )}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-5 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {business.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
