import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { T } from "@/components/i18n/t";
import { ArrowLeft, ArrowRight } from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { cardSurface, cardSurfaceSm } from "@/components/marketing/ui/card";
import "@/components/marketing/changelog/changelog.css";
import { VersionBadge } from "@/components/marketing/changelog/timeline";
import { ChangelogCta } from "@/components/marketing/changelog/changelog-cta";
import { ReleaseDate } from "@/components/changelog/release-date";
import { KindCounts, ReleaseGroups } from "@/components/changelog/release-groups";
import { LATEST_RELEASED_VERSION, RELEASES, adjacentReleases, findRelease } from "@/lib/changelog";
import enMessages from "@/messages/site/changelog/en.json";
import { SITE_URL } from "@/lib/site";

type Params = { version: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return RELEASES.map((r) => ({ version: r.version }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { version } = await params;
  const release = findRelease(version);
  if (!release) return {};
  const entry = (
    enMessages.changelog as unknown as Record<string, { title: string; summary: string }>
  )[release.key];
  const url = `${SITE_URL}/changelog/${release.version}`;
  return {
    title: `zcrypt ${release.version}: ${entry.title}`,
    description: entry.summary,
    alternates: {
      canonical: url,
      types: { "application/rss+xml": `${SITE_URL}/changelog/feed.xml` },
    },
    ...(release.date === null && { robots: { index: false, follow: true } }),
    openGraph: {
      title: `zcrypt ${release.version}: ${entry.title}`,
      description: entry.summary,
      url,
      type: "article",
      ...(release.date && { publishedTime: release.date }),
    },
    twitter: {
      card: "summary_large_image",
      title: `zcrypt ${release.version}: ${entry.title}`,
      description: entry.summary,
    },
  };
}

export default async function ChangelogVersionPage({ params }: { params: Promise<Params> }) {
  const { version } = await params;
  const release = findRelease(version);
  if (!release) notFound();
  const { newer, older } = adjacentReleases(release.version);

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "zcrypt", url: SITE_URL },
          { name: "Changelog", url: `${SITE_URL}/changelog` },
          { name: release.version, url: `${SITE_URL}/changelog/${release.version}` },
        ]}
      />
      <PageHero
        badge={
          <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
            <VersionBadge release={release} />
            <span className="text-[13px] text-[var(--color-text-muted)]">
              <ReleaseDate date={release.date} relative />
            </span>
            <KindCounts release={release} />
          </div>
        }
        title={<T k={`changelog.${release.key}.title`} />}
        lede={<T k={`changelog.${release.key}.summary`} />}
      />
      <section className="pv2-sec pv2-sec-join" aria-label="Release notes">
        <div className="pv2-wrap pv2-wrap-narrow">
          {release.date === null ? (
            <p className="mb-6 text-center text-[13px] font-medium text-amber-700 dark:text-amber-300">
              <T k="changelog.page.upcomingNote" />
            </p>
          ) : null}
          <div
            className={`${cardSurface} cl-card p-6 sm:p-10 ${release.version === LATEST_RELEASED_VERSION ? "cl-latest" : ""} ${release.date === null ? "cl-upcoming outline outline-1 -outline-offset-1 outline-dashed outline-amber-500/40" : ""}`}
          >
            <ReleaseGroups release={release} />
          </div>

          <nav aria-label="Versions" className="mt-10 grid gap-4 sm:grid-cols-2">
            {older ? (
              <Link
                href={`/changelog/${older.version}`}
                className={`${cardSurfaceSm} pv2-card-link group block p-5`}
              >
                <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                  <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5 rtl:-scale-x-100" />
                  <T k="changelog.page.previous" />
                </span>
                <span className="mt-2 block font-mono text-sm font-semibold text-[var(--pv2-accent-ink)]">
                  v{older.version}
                </span>
                <span className="mt-0.5 block font-[family-name:var(--font-heading)] text-[1.05rem] font-bold leading-snug tracking-tight text-[var(--color-text)]">
                  <T k={`changelog.${older.key}.title`} />
                </span>
              </Link>
            ) : (
              <span />
            )}
            {newer ? (
              <Link
                href={`/changelog/${newer.version}`}
                className={`${cardSurfaceSm} pv2-card-link group block p-5 text-end`}
              >
                <span className="flex items-center justify-end gap-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
                  <T k="changelog.page.next" />
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
                </span>
                <span className="mt-2 block font-mono text-sm font-semibold text-[var(--pv2-accent-ink)]">
                  v{newer.version}
                </span>
                <span className="mt-0.5 block font-[family-name:var(--font-heading)] text-[1.05rem] font-bold leading-snug tracking-tight text-[var(--color-text)]">
                  <T k={`changelog.${newer.key}.title`} />
                </span>
              </Link>
            ) : (
              <span />
            )}
          </nav>

          <p className="mt-6 text-center">
            <Link
              href="/changelog"
              className="text-[13px] font-semibold text-[var(--pv2-accent-ink)] hover:underline"
            >
              <T k="changelog.page.allVersions" />
            </Link>
          </p>
          <div className="mt-12">
            <ChangelogCta />
          </div>
        </div>
      </section>
    </>
  );
}
