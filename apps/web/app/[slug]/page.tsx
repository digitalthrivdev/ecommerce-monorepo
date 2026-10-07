import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageTitle } from "@/components/page-title";
import { PolicyText } from "@/components/policy-text";
import { ApiError, apiGet } from "@/lib/api";
import type { PolicyPage } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { getSettings } from "@/lib/website";

async function getPage(slug: string) {
  try {
    return await apiGet<PolicyPage>(`/settings/website/pages/${encodeURIComponent(slug)}`);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const page = await getPage((await params).slug);
  return { title: page.title, description: `${page.title} of ${page.business.name}.` };
}

export default async function PolicyPageView({ params }: PageProps<"/[slug]">) {
  const [page, settings] = await Promise.all([getPage((await params).slug), getSettings()]);

  return (
    <>
      <PageTitle eyebrow="Policies" title={page.title}>
        {page.updatedAt && <p className="text-sm">Last updated {formatDate(page.updatedAt, settings.timezone)}</p>}
      </PageTitle>
      <article className="mx-auto w-full max-w-3xl px-5 py-12">
        <PolicyText body={page.body} />
      </article>
    </>
  );
}
