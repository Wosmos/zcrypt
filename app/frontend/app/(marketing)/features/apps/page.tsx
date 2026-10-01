import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Globe,
  Monitor,
  Smartphone,
  Terminal,
  ShieldCheck,
  Server,
  Check,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { IconWell, cardSurface, cardSurfaceSm } from "@/components/marketing/ui/card";
import { cn } from "@/lib/utils";
import { apps } from "../_data/apps";
import { SITE_URL, SITE_DOMAIN } from "@/lib/site";

export const metadata: Metadata = {
  title: "Web, Desktop, Android & Terminal. One Encrypted Vault, Four Surfaces",
  description:
    "The same zero-knowledge core wherever you work: a web app in any browser, a native desktop app for macOS, Windows and Linux, an Android app you sideload in a minute, and a single-binary terminal app (TUI) that runs over SSH. Your encryption never changes, only the interface does.",
  keywords: [
    "encrypted storage apps",
    "web app",
    "desktop app",
    "Android app",
    "sideload APK",
    "terminal app",
    "TUI",
    "CLI encrypted storage",
    "macOS Windows Linux",
    "SSH file storage",
    "cross-platform encryption",
  ],
  alternates: { canonical: `${SITE_URL}/features/apps` },
  openGraph: {
    title: "Web, Desktop, Android & Terminal. One Encrypted Vault | zcrypt",
    description:
      "One zero-knowledge core across four surfaces: web in any browser, a native desktop app, an Android sideload APK, and a single-binary TUI that works over SSH.",
    url: `${SITE_URL}/features/apps`,
    type: "website",
  },
};

export default function AppsPage() {
  const {
    hero,
    sharedCoreNote,
    surfacesSection,
    surfaces,
    comparisonSection,
    comparison,
    related,
    cta,
  } = apps;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "Features", url: `${SITE_URL}/features/encrypted-drive` },
          { name: "Apps", url: `${SITE_URL}/features/apps` },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <FeatureHero
        eyebrow={hero.eyebrow}
        title={hero.title}
        subtext={hero.subtext}
        secondaryLabel={hero.secondaryLabel}
        secondaryHref={hero.secondaryHref}
      >
        {/* Four-surface mock */}
        <div className="mx-auto mt-16 max-w-4xl">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {/* browser */}
            <div className={cn(cardSurfaceSm, "overflow-hidden")}>
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]">
                <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
                <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
                <span className="h-2 w-2 rounded-full bg-[#28c840]" />
                <div className="ml-2 flex-1 truncate rounded-md bg-black/[0.04] px-2 py-0.5 font-mono text-[9px] text-[var(--color-text-muted)] dark:bg-white/[0.04]">
                  {SITE_DOMAIN}
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <Globe className="h-7 w-7 text-[var(--pv2-accent-ink)]" />
                <div className="text-xs font-bold">Web</div>
                <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  any browser
                </div>
              </div>
            </div>

            {/* desktop */}
            <div className={cn(cardSurfaceSm, "overflow-hidden")}>
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]">
                <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
                <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
                <span className="h-2 w-2 rounded-full bg-[#28c840]" />
                <span className="ml-2 font-mono text-[9px] text-[var(--color-text-muted)]">
                  zcrypt
                </span>
              </div>
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <Monitor className="h-7 w-7 text-[var(--pv2-accent-ink)]" />
                <div className="text-xs font-bold">Desktop</div>
                <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  macOS · Win · Linux
                </div>
              </div>
            </div>

            {/* android phone */}
            <div className={cn(cardSurfaceSm, "overflow-hidden")}>
              <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]">
                <span className="font-mono text-[9px] text-[var(--color-text-muted)]">9:41</span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500/60" />
                  <span className="h-2 w-2 rounded-full bg-emerald-500/40" />
                  <span className="h-2 w-3 rounded-sm bg-emerald-500/60" />
                </span>
              </div>
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <Smartphone className="h-7 w-7 text-emerald-500" />
                <div className="text-xs font-bold">Android</div>
                <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  sideload APK
                </div>
              </div>
            </div>

            {/* terminal */}
            <div className="overflow-hidden rounded-[22px] corner-squircle border border-[var(--color-border)] bg-[#09090b] shadow-xl shadow-black/30">
              <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-3 py-2.5">
                <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
                <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
                <span className="h-2 w-2 rounded-full bg-[#28c840]" />
                <span className="ml-2 font-mono text-[9px] text-white/30">ssh · zcrypt</span>
              </div>
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <Terminal className="h-7 w-7 text-cyan-400" />
                <div className="text-xs font-bold text-white/90">Terminal</div>
                <div className="font-mono text-[10px] text-white/30">one binary</div>
              </div>
            </div>
          </div>
          <div
            className={cn(
              cardSurfaceSm,
              "mt-4 flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left",
            )}
          >
            <IconWell icon={ShieldCheck} />
            <p className="pv2-body">{sharedCoreNote}</p>
          </div>
        </div>
      </FeatureHero>

      {/* ═══ THE THREE SURFACES ═══ */}
      <section className="pv2-sec" aria-labelledby="h-surfaces">
        <div className="pv2-wrap">
          <SectionHead
            id="h-surfaces"
            eyebrow="Pick your surface"
            title={surfacesSection.heading}
            lede={surfacesSection.subheading}
          />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 list-none">
            {surfaces.map((s) => (
              <li key={s.name} className={cn(cardSurfaceSm, "flex flex-col p-6")}>
                <IconWell icon={s.Icon} className="mb-5" />
                <div className="flex items-center gap-2">
                  <h3 className="pv2-h3 text-lg">{s.name}</h3>
                  {s.badge && (
                    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                      {s.badge}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs font-medium text-[var(--pv2-accent-ink)]">{s.tagline}</p>
                <p className="pv2-body mt-3 text-sm">{s.desc}</p>
                <ul className="mt-4 space-y-2">
                  {s.points.map((p) => (
                    <li
                      key={p}
                      className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]"
                    >
                      <Check
                        className="h-3.5 w-3.5 flex-shrink-0 text-[var(--pv2-accent-ink)]"
                        strokeWidth={3}
                      />
                      {p}
                    </li>
                  ))}
                </ul>
                <Link
                  href={s.href}
                  className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold text-[var(--pv2-accent-ink)] transition-all hover:gap-2.5"
                >
                  {s.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ═══ COMPARISON ═══ */}
      <section className="pv2-sec pv2-sec-join" aria-labelledby="h-compare">
        <div className="pv2-wrap">
          <SectionHead
            id="h-compare"
            eyebrow="Side by side"
            title={comparisonSection.heading}
            lede={comparisonSection.subheading}
          />

          {/* table on md+, cards on mobile */}
          <div className={cn(cardSurface, "hidden overflow-x-auto px-8 py-4 md:block")}>
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="py-3 pr-4 font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Surface
                  </th>
                  <th className="py-3 pr-4 font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Best for
                  </th>
                  <th className="py-3 pr-4 font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Install
                  </th>
                  <th className="py-3 font-heading text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Runs on
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr
                    key={row.surface}
                    className="border-b border-[var(--color-border)] last:border-0"
                  >
                    <td className="py-4 pr-4 font-semibold">{row.surface}</td>
                    <td className="py-4 pr-4 text-[var(--color-text-secondary)]">{row.bestFor}</td>
                    <td className="py-4 pr-4 text-[var(--color-text-secondary)]">{row.install}</td>
                    <td className="py-4 text-[var(--color-text-secondary)]">{row.runsOn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 gap-4 md:hidden">
            {comparison.map((row) => (
              <div key={row.surface} className={cn(cardSurfaceSm, "p-5")}>
                <h3 className="pv2-h3 text-base">{row.surface}</h3>
                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-text-muted)]">Best for</dt>
                    <dd className="text-right text-[var(--color-text-secondary)]">{row.bestFor}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-text-muted)]">Install</dt>
                    <dd className="text-right text-[var(--color-text-secondary)]">{row.install}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--color-text-muted)]">Runs on</dt>
                    <dd className="text-right text-[var(--color-text-secondary)]">{row.runsOn}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>

          <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-[var(--color-text-muted)]">
            <Server className="h-3.5 w-3.5 flex-shrink-0" />
            {comparisonSection.footnote}
          </p>
        </div>
      </section>

      {/* ═══ RELATED + CTA ═══ */}
      <RelatedLinks items={related} />
      <ClosingCta title={cta.heading} subtext={cta.subtext} />
    </>
  );
}
