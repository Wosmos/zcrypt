import Link from "next/link";
import { Download, ShieldCheck, ChevronRight } from "@/lib/icons";
import { RELEASES_FALLBACK_URL, type CliBinary, type ReleaseData } from "@/lib/releases";

function group(binaries: CliBinary[]) {
  const order: CliBinary["os"][] = ["macOS", "Linux", "Windows"];
  return order
    .map((os) => ({ os, items: binaries.filter((b) => b.os === os) }))
    .filter((g) => g.items.length > 0);
}

/** Prebuilt CLI/TUI binary downloads + checksums, from the latest release. */
export function CliBinaries({ release }: { release: ReleaseData | null }) {
  const groups = release ? group(release.cli) : [];

  return (
    <>
      {release && groups.length > 0 && (
        <div className="mt-8">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Or grab a prebuilt binary &middot; v{release.version}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {groups.map((g) => (
              <div
                key={g.os}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
              >
                <p className="mb-2 text-[13px] font-semibold text-[var(--color-text)]">
                  {g.os}
                </p>
                <div className="flex flex-col gap-1">
                  {g.items.map((b) => (
                    <a
                      key={b.arch}
                      href={b.href}
                      className="group flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                    >
                      {b.arch}
                      <Download className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/tui"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-hover)]"
        >
          Explore the terminal app
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        <a
          href={release?.checksumsUrl ?? RELEASES_FALLBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
        >
          <ShieldCheck className="h-4 w-4" />
          Verify checksums
        </a>
      </div>
    </>
  );
}
