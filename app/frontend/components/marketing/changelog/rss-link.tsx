import Link from "next/link";
import { T } from "@/components/i18n/t";

export function RssLink() {
  return (
    <Link
      prefetch={false}
      href="/changelog/feed.xml"
      className="group inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-[13px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 text-[var(--pv2-accent-ink)]"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M5 11a8 8 0 0 1 8 8" />
        <path d="M5 4a15 15 0 0 1 15 15" />
        <circle cx="6" cy="18" r="1.4" fill="currentColor" stroke="none" />
      </svg>
      <T k="changelog.page.rss" />
    </Link>
  );
}
