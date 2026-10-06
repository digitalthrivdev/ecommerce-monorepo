import type { Metadata } from "next";
import Link from "next/link";

import { getSiteBase, getWebsite, sitePages } from "@/lib/website";

export async function generateMetadata(): Promise<Metadata> {
  const { business } = await getWebsite();
  return {
    title: { template: `%s · ${business.appName}`, default: business.appName },
    description: `${business.appName}: groceries and daily essentials delivered to your door.`,
    robots: { index: true, follow: true },
  };
}

/** The public website: no sign-in, no dashboard chrome. */
export default async function SiteLayout({ children }: LayoutProps<"/site">) {
  const [{ business, pages }, base] = await Promise.all([getWebsite(), getSiteBase()]);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4">
          <Link href={base || "/"} className="flex items-center gap-3 font-semibold">
            {business.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- the logo can be on any host
              <img src={business.logoUrl} alt="" className="size-9 rounded-lg object-contain" />
            )}
            <span className="text-lg">{business.appName}</span>
          </Link>
          <Link href={`${base}/contact`} className="ml-auto text-sm font-medium text-muted-foreground hover:text-foreground">
            Contact
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-6 text-sm text-muted-foreground">
          <nav aria-label="Policies" className="flex flex-wrap gap-x-5 gap-y-2">
            {sitePages(pages).map((page) => (
              <Link key={page.path} href={`${base}${page.path}`} className="hover:text-foreground hover:underline">
                {page.title}
              </Link>
            ))}
          </nav>
          <p>
            © {new Date().getFullYear()} {business.name}
          </p>
        </div>
      </footer>
    </div>
  );
}
