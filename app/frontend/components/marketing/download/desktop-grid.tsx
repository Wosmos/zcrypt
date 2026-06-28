"use client";

import { Download, ArrowRight } from "@/lib/icons";
import { RELEASES_FALLBACK_URL, type PlatformId } from "@/lib/releases";
import { OS_GLYPHS } from "./os-glyphs";
import { useLatestRelease } from "./use-release";

const glyphColor: Record<PlatformId, string> = {
  macos: "text-[var(--color-text)]",
  windows: "text-[#3b82f6]",
  linux: "text-[var(--color-text)]",
};

const glow: Record<PlatformId, string> = {
  macos: "bg-cyan-400/15",
  windows: "bg-blue-500/15",
  linux: "bg-amber-400/15",
};

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[var(--color-border-hover)] hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/30">
      {children}
    </div>
  );
}

export function DesktopGrid() {
  const release = useLatestRelease();

  // Loading skeleton.
  if (release === undefined) {
    return (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[260px] animate-pulse rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]"
          />
        ))}
      </div>
    );
  }

  // API unavailable → send people to the releases page rather than show nothing.
  if (release === null || release.desktop.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Couldn&apos;t load the latest builds right now.
        </p>
        <a
          href={RELEASES_FALLBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--color-text)] px-5 py-2.5 text-sm font-semibold text-[var(--color-bg)] transition-opacity hover:opacity-90"
        >
          View all downloads on GitHub
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    );
  }

  return (
    <>
      {release.isFallback && (
        <div className="mx-auto mb-5 max-w-lg rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-center text-xs text-amber-700 dark:text-amber-400">
          Couldn&apos;t reach GitHub for the latest release — showing{" "}
          <span className="font-semibold">v{release.version}</span>.{" "}
          <a
            href={RELEASES_FALLBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            Check for newer
          </a>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {release.desktop.map((platform) => {
        const Glyph = OS_GLYPHS[platform.id];
        const primary =
          platform.options.find((o) => o.recommended) ?? platform.options[0];
        const others = platform.options.filter((o) => o !== primary);
        return (
          <CardShell key={platform.id}>
            <div
              aria-hidden
              className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100 ${glow[platform.id]}`}
            />
            <div className="relative flex items-start justify-between">
              <Glyph
                className={`h-12 w-12 transition-transform duration-300 group-hover:scale-105 ${glyphColor[platform.id]}`}
              />
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 font-mono text-[11px] text-[var(--color-text-muted)]">
                v{release.version}
              </span>
            </div>

            <h3 className="relative mt-6 text-xl font-bold tracking-tight">
              {platform.name}
            </h3>
            <p className="relative mt-1.5 min-h-[2.5rem] text-[13px] leading-relaxed text-[var(--color-text-muted)]">
              {platform.blurb}
            </p>

            <div className="relative mt-6 flex flex-1 flex-col justify-end">
              <a
                href={primary.href}
                className="group/dl flex items-center justify-center gap-2 rounded-xl bg-[var(--color-text)] px-4 py-3 text-sm font-semibold text-[var(--color-bg)] transition-opacity hover:opacity-90"
              >
                <Download className="h-4 w-4 transition-transform group-hover/dl:translate-y-0.5" />
                Download for {platform.name}
              </a>
              <p className="mt-2.5 text-center text-[11px] text-[var(--color-text-muted)]">
                {primary.sublabel}
                {others.length > 0 && (
                  <>
                    {" · also "}
                    {others.map((o, i) => (
                      <span key={o.label}>
                        {i > 0 && ", "}
                        <a
                          href={o.href}
                          className="font-medium text-[var(--color-text-secondary)] underline-offset-2 transition-colors hover:text-cyan-600 hover:underline dark:hover:text-cyan-400"
                        >
                          {o.sublabel.split("·").pop()?.trim()}
                        </a>
                      </span>
                    ))}
                  </>
                )}
              </p>
            </div>
          </CardShell>
        );
        })}
      </div>
    </>
  );
}
