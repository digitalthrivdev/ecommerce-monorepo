import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PolicyText } from "@/components/site/policy-text";
import { ApiError, apiFetch } from "@/lib/api";
import { getPublicSettings } from "@/lib/dal";
import { formatDate } from "@/lib/format";
import type { PolicyPage } from "@/lib/types";

async function getPage(slug: string) {
  try {
    return await apiFetch<PolicyPage>(`/settings/website/pages/${encodeURIComponent(slug)}`, { auth: false });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps<"/site/[slug]">): Promise<Metadata> {
  const page = await getPage((await params).slug);
  return { title: page.title, description: `${page.title} of ${page.business.name}.` };
}

export default async function PolicyPageView({ params }: PageProps<"/site/[slug]">) {
  const [page, settings] = await Promise.all([getPage((await params).slug), getPublicSettings()]);

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
        {page.updatedAt && <p className="mt-2 text-sm text-muted-foreground">Last updated {formatDate(page.updatedAt, settings.timezone)}</p>}
      </div>
      <PolicyText body={page.body} />
    </article>
  );
}
