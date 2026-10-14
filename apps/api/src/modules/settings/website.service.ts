import type { PrismaClient } from "../../generated/prisma/client";
import { AppError } from "../../shared/errors.js";
import { getAppearance } from "./appearance.service.js";
import { POLICY_SLUGS, POLICY_TEMPLATES, POLICY_TITLES, type PolicySlug } from "./policy-templates.js";
import { getPlatformSettings } from "./settings.service.js";

function isPolicySlug(slug: string): slug is PolicySlug {
  return (POLICY_SLUGS as readonly string[]).includes(slug);
}

function assertPolicySlug(slug: string): asserts slug is PolicySlug {
  if (!isPolicySlug(slug)) {
    throw new AppError(404, "POLICY_NOT_FOUND", "Policy page not found", { slug });
  }
}

/** The public website on SITE_DOMAIN: home page details and the policy pages. */
export function createWebsiteService(prisma: PrismaClient) {
  async function getBusiness() {
    const [settings, { appearance }] = await Promise.all([getPlatformSettings(prisma), getAppearance(prisma)]);
    return {
      appName: appearance.appName,
      logoUrl: appearance.logoUrl,
      name: settings.businessName ?? appearance.appName,
      address: settings.businessAddress,
      email: settings.supportEmail,
      phone: settings.supportPhone,
    };
  }

  type Business = Awaited<ReturnType<typeof getBusiness>>;

  /** Null when the app has no links; the direct download is dropped once a store listing exists. */
  function appLinks(playStore: string | null, appStore: string | null, download: string | null) {
    if (!playStore && !appStore && !download) {
      return null;
    }
    return { playStore, appStore, download: playStore || appStore ? null : download };
  }

  function fill(body: string, business: Business) {
    const contact = [
      `- ${business.name}`,
      business.address && `- Address: ${business.address.replace(/\s*\n\s*/g, ", ")}`,
      business.email && `- Email: ${business.email}`,
      business.phone && `- Phone: ${business.phone}`,
    ]
      .filter(Boolean)
      .join("\n");

    return body
      .replaceAll("{{appName}}", business.appName)
      .replaceAll("{{businessName}}", business.name)
      .replaceAll("{{contact}}", contact);
  }

  /** Public: home page details and the title of every policy page. */
  async function getWebsite() {
    const [business, settings, saved] = await Promise.all([
      getBusiness(),
      getPlatformSettings(prisma),
      prisma.policyPage.findMany({ select: { slug: true, updatedAt: true } }),
    ]);
    const updatedAt = new Map(saved.map((page) => [page.slug, page.updatedAt]));

    return {
      business,
      tagline: settings.websiteTagline,
      apps: {
        customer: appLinks(settings.playStoreUrl, settings.appStoreUrl, settings.appDownloadUrl),
      },
      pages: POLICY_SLUGS.map((slug) => ({ slug, title: POLICY_TITLES[slug], updatedAt: updatedAt.get(slug) ?? null })),
    };
  }

  /** Public: one page with the placeholders filled in. */
  async function getPublic(slug: string) {
    assertPolicySlug(slug);
    const [business, saved] = await Promise.all([getBusiness(), prisma.policyPage.findUnique({ where: { slug } })]);

    return {
      slug,
      title: POLICY_TITLES[slug],
      body: fill(saved?.body ?? POLICY_TEMPLATES[slug], business),
      updatedAt: saved?.updatedAt ?? null,
      business,
    };
  }

  /** Admin: every page's text as saved (placeholders kept), with the template to restore. */
  async function listForEditing() {
    const saved = await prisma.policyPage.findMany();
    const bySlug = new Map(saved.map((page) => [page.slug, page]));

    return POLICY_SLUGS.map((slug) => {
      const page = bySlug.get(slug);
      return {
        slug,
        title: POLICY_TITLES[slug],
        body: page?.body ?? POLICY_TEMPLATES[slug],
        template: POLICY_TEMPLATES[slug],
        custom: Boolean(page),
        updatedAt: page?.updatedAt ?? null,
      };
    });
  }

  async function save(slug: string, body: string, adminId: string) {
    assertPolicySlug(slug);
    await prisma.policyPage.upsert({
      where: { slug },
      create: { slug, body, updatedById: adminId },
      update: { body, updatedById: adminId },
    });
    return listForEditing();
  }

  async function restoreTemplate(slug: string) {
    assertPolicySlug(slug);
    await prisma.policyPage.deleteMany({ where: { slug } });
    return listForEditing();
  }

  return { getWebsite, getPublic, listForEditing, save, restoreTemplate };
}
