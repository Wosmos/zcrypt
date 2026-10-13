import { Download, ArrowRight } from "@/lib/icons";
import {
  RELEASES_FALLBACK_URL,
  type PlatformId,
  type DownloadOption,
  type ReleaseData,
} from "@/lib/releases";
import { cn } from "@/lib/utils";
import { cardSurface } from "@/components/marketing/ui/card";
import { pillClass } from "@/components/marketing/ui/pill-link";
import { T } from "@/components/i18n/t";
import { OS_GLYPHS } from "./os-glyphs";

const OPTION_LABEL_KEYS: Record<string, string> = {
  Installer: "installer",
  "MSI package": "msiPackage",
  Portable: "portable",
};

function OptionLabel({ label }: { label: string }) {
  const key = OPTION_LABEL_KEYS[label];
  return key ? <T k={`site.download.desktop.options.${key}`} /> : <>{label}</>;
}

function OptionNote({ note }: { note: string }) {
  return note.startsWith("One-time setup") ? (
    <T k="site.download.desktop.appImageNote" />
  ) : (
    <>{note}</>
  );
}

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
    <li className={cn("group flex flex-col overflow-hidden p-6 sm:p-7", cardSurface)}>
      {children}
    </li>
  );
}

// Linux can't get a single confident "recommended" pick (the site can't see
// distros. See the fallback note on the page), so all three packages are
// shown as equal-weight rows naming the actual OS family instead of one big
// button plus two extension-only footnotes.
function LinuxOptions({ options }: { options: DownloadOption[] }) {
  return (
    <div className="relative mt-6 flex flex-col gap-2">
      {options.map((o) => (
        <div key={o.label}>
          <a
            href={o.href}
            className="group/row flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2.5 transition-colors hover:border-[var(--color-border-hover)] hover:bg-[var(--color-surface-1)]"
          >
            <span>
              <span className="block text-sm font-semibold">
                <OptionLabel label={o.label} />
              </span>
              <span className="block text-[11px] text-[var(--color-text-muted)]">{o.sublabel}</span>
            </span>
            <Download className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)] transition-transform group-hover/row:translate-y-0.5 group-hover/row:text-[var(--color-text)]" />
          </a>
          {o.note && (
            <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
              <OptionNote note={o.note} />
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// Collapsed by default so the page doesn't shout a security warning at every
// visitor: one click away for the person who actually hits the OS prompt.
function SecurityNote({ id }: { id: PlatformId }) {
  return (
    <details className="group/note relative mt-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-2.5">
      <summary className="cursor-pointer list-none text-[11px] font-medium text-[var(--color-text-secondary)] marker:content-none">
        <T k={`site.download.desktop.security.${id}.title`} />
        <span className="ms-1 font-normal text-[var(--color-text-muted)] group-open/note:hidden">
          <T k="site.download.desktop.tapHow" />
        </span>
      </summary>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
        <T k={`site.download.desktop.security.${id}.body`} />
      </p>
    </details>
  );
}

export function DesktopGrid({ release }: { release: ReleaseData | null }) {
  // API unavailable → send people to the releases page rather than show nothing.
  if (release === null || release.desktop.length === 0) {
    return (
      <div className={cn("mx-auto max-w-md p-8 text-center", cardSurface)}>
        <p className="text-sm text-[var(--color-text-secondary)]">
          <T k="site.download.desktop.loadFail" />
        </p>
        <a
          href={RELEASES_FALLBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("mt-5", pillClass("secondary"))}
        >
          <T k="site.download.desktop.viewAll" />
          <ArrowRight className="rtl:-scale-x-100 h-4 w-4" />
        </a>
      </div>
    );
  }

  return (
    <>
      {release.isFallback && (
        <div className="mx-auto mb-5 max-w-lg rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-center text-xs text-amber-700 dark:text-amber-400">
          <T
            k="site.download.desktop.fallback"
            values={{ version: release.version }}
            links={{ releases: RELEASES_FALLBACK_URL }}
            linkClassName="font-medium underline underline-offset-2"
          />
        </div>
      )}
      <ul className="grid grid-cols-1 gap-5 md:grid-cols-3 list-none">
        {release.desktop.map((platform) => {
          const Glyph = OS_GLYPHS[platform.id];
          const primary = platform.options.find((o) => o.recommended) ?? platform.options[0];
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

              <h3 className="pv2-h3 relative mt-6 text-xl">{platform.name}</h3>
              <p className="relative mt-1.5 min-h-[2.5rem] text-[13px] leading-relaxed text-[var(--color-text-muted)]">
                <T k={`site.download.desktop.blurb.${platform.id}`} />
              </p>

              <div className="relative mt-6 flex flex-1 flex-col justify-end">
                {platform.id === "linux" ? (
                  <LinuxOptions options={platform.options} />
                ) : (
                  <>
                    <a
                      href={primary.href}
                      className={cn("group/dl w-full", pillClass("secondary"))}
                    >
                      <Download className="h-4 w-4 transition-transform group-hover/dl:translate-y-0.5" />
                      <T k="site.download.desktop.downloadFor" values={{ name: platform.name }} />
                    </a>
                    <p className="mt-2.5 text-center text-[11px] text-[var(--color-text-muted)]">
                      {primary.sublabel}
                      {others.length > 0 && (
                        <>
                          {" · "}
                          <T k="site.download.desktop.also" />{" "}
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
                  </>
                )}
                {platform.securityNote && <SecurityNote id={platform.id} />}
              </div>
            </CardShell>
          );
        })}
      </ul>
    </>
  );
}
