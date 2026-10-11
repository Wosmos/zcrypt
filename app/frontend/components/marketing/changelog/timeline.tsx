import Link from "next/link";
import { cn } from "@/lib/utils";
import { T } from "@/components/i18n/t";
import { ArrowRight } from "@/lib/icons";
import { cardSurface } from "@/components/marketing/ui/card";
import { ReleaseDate } from "@/components/changelog/release-date";
import { ReleaseGroups } from "@/components/changelog/release-groups";
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
  );
}

function TimelineItem({ release, last }: { release: Release; last: boolean }) {
  const upcoming = release.date === null;
  return (
    <li
      id={`v${release.version}`}
      className="relative grid scroll-mt-28 grid-cols-[1.25rem_minmax(0,1fr)] gap-x-4 md:grid-cols-[9.5rem_1.25rem_minmax(0,1fr)] md:gap-x-6"
    >
      <div className="relative col-start-1 row-span-2 md:col-start-2 md:row-span-1 md:row-start-1">
        <span
          aria-hidden="true"
          className={cn(
            "absolute start-1/2 top-[0.7rem] z-10 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-[var(--color-bg)] rtl:translate-x-1/2",
            upcoming ? "bg-amber-500" : "bg-[var(--color-accent)]",
          )}
        />
        {last ? null : (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 start-1/2 top-[1.1rem] w-px -translate-x-1/2 bg-gradient-to-b from-[var(--color-border-hover)] to-[var(--color-border)] rtl:translate-x-1/2"
          />
        )}
      </div>

      <div className="col-start-2 row-start-1 pb-4 md:col-start-1 md:pb-0 md:text-end">
        <VersionBadge release={release} className="md:justify-end" />
        <p className="mt-1 text-[13px] text-[var(--color-text-muted)]">
          <ReleaseDate date={release.date} />
        </p>
      </div>

      <div
        className={cn(
          "col-start-2 row-start-2 pb-14 md:col-start-3 md:row-start-1",
          last && "pb-0",
        )}
      >
        <div
          className={cn(
            cardSurface,
            "p-6 sm:p-8",
            upcoming && "outline outline-1 -outline-offset-1 outline-dashed outline-amber-500/40",
          )}
        >
          <ReleaseHeading release={release} />
          {upcoming ? (
            <p className="mt-1 text-[13px] font-medium text-amber-700 dark:text-amber-300">
              <T k="changelog.page.upcomingNote" />
            </p>
          ) : null}
          <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-[var(--color-text-secondary)]">
            <T k={`changelog.${release.key}.summary`} />
          </p>
          <ReleaseGroups release={release} className="mt-7" />
          <Link
            href={`/changelog/${release.version}`}
            className="group mt-7 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--pv2-accent-ink)] hover:underline"
          >
            <T k="changelog.page.readMore" />
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </div>
      </div>
    </li>
  );
}

export function ChangelogTimeline({ releases }: { releases: Release[] }) {
  return (
    <ol className="m-0 list-none p-0">
      {releases.map((r, i) => (
        <TimelineItem key={r.version} release={r} last={i === releases.length - 1} />
      ))}
    </ol>
  );
}
