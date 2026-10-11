import Link from "next/link";
import { cn } from "@/lib/utils";
import { T } from "@/components/i18n/t";
import { ArrowRight, Link2 } from "@/lib/icons";
import { cardSurface } from "@/components/marketing/ui/card";
import "@/components/marketing/changelog/changelog.css";
import { ReleaseDate } from "@/components/changelog/release-date";
import { KindCounts, ReleaseGroups } from "@/components/changelog/release-groups";
import { TimelineControls } from "@/components/marketing/changelog/timeline-controls";
import { LATEST_RELEASED_VERSION, type Release } from "@/lib/changelog";

export function VersionBadge({ release, className }: { release: Release; className?: string }) {
  const upcoming = release.date === null;
  const latest = release.version === LATEST_RELEASED_VERSION;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <span className="font-mono text-sm font-semibold tabular-nums tracking-tight text-[var(--color-text)]">
        v{release.version}
      </span>
      {upcoming ? (
        <span className="rounded-full border border-dashed border-amber-500/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
          <T k="changelog.page.upcomingBadge" />
        </span>
      ) : null}
      {latest ? (
        <span className="rounded-full bg-cyan-500/14 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300">
          <T k="changelog.page.latestBadge" />
        </span>
      ) : null}
    </span>
  );
}

export function ReleaseHeading({
  release,
  as: Tag = "h2",
  linked = true,
}: {
  release: Release;
  as?: "h1" | "h2";
  linked?: boolean;
}) {
  const title = <T k={`changelog.${release.key}.title`} />;
  return (
    <div className="cl-heading flex items-start gap-2">
      <Tag className="font-[family-name:var(--font-heading)] text-2xl font-bold leading-tight tracking-[-0.02em] text-[var(--color-text)] sm:text-[1.75rem]">
        {linked ? (
          <Link
            href={`/changelog/${release.version}`}
            className="decoration-[var(--color-accent)]/60 underline-offset-4 hover:underline focus-visible:underline"
          >
            {title}
          </Link>
        ) : (
          title
        )}
      </Tag>
      {linked ? (
        <a
          href={`#v${release.version}`}
          className="cl-anchor mt-1.5 inline-flex text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
        >
          <Link2 className="h-4 w-4" />
          <span className="sr-only">
            <T k="changelog.page.permalink" />
          </span>
        </a>
      ) : null}
    </div>
  );
}

function TimelineItem({ release }: { release: Release }) {
  const upcoming = release.date === null;
  const latest = release.version === LATEST_RELEASED_VERSION;
  return (
    <li
      id={`v${release.version}`}
      data-release={release.version}
      data-kinds={release.groups.map((g) => g.kind).join(" ")}
      {...(upcoming ? { "data-upcoming": "" } : {})}
      className="relative scroll-mt-28 ps-10 pb-12 md:ps-14"
    >
      <span aria-hidden="true" className="cl-node" />
      <div
        className={cn(
          cardSurface,
          "cl-card p-6 sm:p-8",
          latest && "cl-latest",
          upcoming &&
            "cl-upcoming outline outline-1 -outline-offset-1 outline-dashed outline-amber-500/40",
        )}
      >
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <VersionBadge release={release} />
          <span className="text-[13px] text-[var(--color-text-muted)]">
            <ReleaseDate date={release.date} relative />
          </span>
          <KindCounts release={release} className="ms-auto" />
        </div>
        <ReleaseHeading release={release} />
        {upcoming ? (
          <p className="mt-1 text-[13px] font-medium text-amber-700 dark:text-amber-300">
            <T k="changelog.page.upcomingNote" />
          </p>
        ) : null}
        <p className="mt-3 max-w-[65ch] text-base leading-7 text-[var(--color-text-secondary)]">
          <T k={`changelog.${release.key}.summary`} />
        </p>
        <ReleaseGroups
          release={release}
          className="mt-7 border-t border-[var(--color-border)] pt-6"
        />
        <Link
          href={`/changelog/${release.version}`}
          className="group mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pv2-accent-ink)] hover:underline"
        >
          <T k="changelog.page.readMore" />
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
        </Link>
      </div>
    </li>
  );
}

export const TIMELINE_ID = "changelog-timeline";

export function ChangelogTimeline({ releases }: { releases: Release[] }) {
  return (
    <>
      <TimelineControls targetId={TIMELINE_ID} />
      <div id={TIMELINE_ID} className="cl-timeline">
        <span aria-hidden="true" className="cl-spine" />
        <span aria-hidden="true" className="cl-spine-fill" />
        <span aria-hidden="true" className="cl-spine-head" />
        <ol className="m-0 list-none p-0">
          {releases.map((r) => (
            <TimelineItem key={r.version} release={r} />
          ))}
        </ol>
      </div>
    </>
  );
}
