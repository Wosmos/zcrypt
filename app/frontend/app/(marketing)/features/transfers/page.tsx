import { pageMetadata } from "@/lib/page-metadata";
import {
  Upload,
  Download,
  Pause,
  Play,
  Archive,
  Smartphone,
  Shield,
  CheckCircle2,
  ChevronDown,
} from "@/lib/icons";
import { FeatureFooter } from "@/components/marketing/features/feature-footer";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { MockWindowFrame } from "@/components/marketing/features/mock-window";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { IconList } from "@/components/marketing/features/icon-list";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { IconWell, cardSurface } from "@/components/marketing/ui/card";
import { cn } from "@/lib/utils";
import { CodePanel } from "@/components/marketing/features/code-panel";
import { transfers } from "../_data/transfers";
import { T } from "@/components/i18n/t";

export const metadata = pageMetadata({
  title: "Transfer Manager. Pause, Resume & Track Every Upload",
  description:
    "A unified, docked transfer manager that survives navigation. Live progress and ETA, pause and resume without re-encrypting, retry on failure, and bulk ZIP downloads: plus encrypted device-to-device transfer with a 6-digit code.",
  path: "/features/transfers",
  keywords: [
    "upload manager",
    "resumable uploads",
    "pause resume upload",
    "download manager",
    "bulk download zip",
    "encrypted file transfer",
    "device to device transfer",
    "transfer progress",
  ],
  ogTitle: "Transfer Manager. Pause, Resume & Track Every Transfer | zcrypt",
  ogDescription:
    "A docked manager that survives navigation: live progress, pause/resume without re-encrypting, retry, and bulk ZIP downloads. Plus encrypted device-to-device transfer.",
});

const queue = [
  {
    Icon: Upload,
    name: "q4-research.tar.zst",
    stage: "encrypting",
    pct: 74,
    state: "active" as const,
  },
  {
    Icon: Upload,
    name: "design-system.fig",
    stage: "paused",
    pct: 41,
    state: "paused" as const,
  },
  {
    Icon: Download,
    name: "photos-2026.zip",
    stage: "downloading",
    pct: 56,
    state: "active" as const,
  },
  {
    Icon: Archive,
    name: "tax-documents.zip",
    stage: "done",
    pct: 100,
    state: "done" as const,
  },
];

const stateStyles: Record<string, string> = {
  active: "bg-cyan-500",
  paused: "bg-amber-500",
  done: "bg-emerald-500",
};

const LEAD = "[&_strong]:font-normal [&_strong]:text-cyan-600/80 dark:[&_strong]:text-cyan-400/80";

export default function TransfersPage() {
  const { hero, capabilitiesSection, capabilities, tieIn, deviceToDevice, related, cta } =
    transfers;

  return (
    <>
      {/* ═══ HERO ═══ */}
      <FeatureHero
        {...hero}
        breadcrumb={{
          name: "Transfers",
          path: "/features/transfers",
          parent: "/features/encrypted-drive",
        }}
      >
        {/* Docked transfer panel mock */}
        <MockWindowFrame
          maxWidth="max-w-md"
          contentClassName=""
          dots={false}
          leading={
            <>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-500/60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
              </span>
              <span className="text-sm font-semibold">
                <T k="site.features.transfers.mock.title" />
              </span>
              <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                <T k="site.features.transfers.mock.summary" />
              </span>
              <ChevronDown className="ml-auto h-4 w-4 text-[var(--color-text-muted)]" />
            </>
          }
        >
          {/* rows */}
          <div className="divide-y divide-[var(--color-border)]">
            {queue.map((q) => (
              <div key={q.name} className="px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <q.Icon className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{q.name}</span>
                  {q.state === "done" ? (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  ) : q.state === "paused" ? (
                    <Play className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)]" />
                  ) : (
                    <Pause className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)]" />
                  )}
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--color-border)]">
                  <div
                    className={`h-full rounded-full ${stateStyles[q.state]}`}
                    style={{ width: `${q.pct}%` }}
                  />
                </div>
                <div className="mt-1.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                  <T k={`site.features.transfers.mock.${q.stage}`} />
                </div>
              </div>
            ))}
          </div>
        </MockWindowFrame>
      </FeatureHero>

      <CapabilityGrid {...capabilitiesSection} items={capabilities} />

      {/* ═══ RESUME DEEP-DIVE ═══ */}
      <TieInSection
        join
        eyebrow={tieIn.eyebrow}
        heading={tieIn.heading}
        body={tieIn.body}
        checklist={
          <IconList
            items={tieIn.checklistItems}
            itemClassName="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]"
            iconClassName="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--pv2-accent-ink)]"
          />
        }
        linkLabel={tieIn.linkLabel}
        linkHref={tieIn.linkHref}
        panel={
          <CodePanel
            comment={<T k="site.features.transfers.panel.comment" />}
            success={<T k="site.features.transfers.panel.success" />}
          >
            <div className={LEAD}>
              <T k="site.features.transfers.panel.line1" />
            </div>
            <div className="mt-1.5 text-emerald-500">
              <T k="site.features.transfers.panel.line2" />
            </div>
            <div className="mt-1.5">
              chunk[18] encrypt → upload{" "}
              <span className="text-cyan-600/80 dark:text-cyan-400/80">✓</span>
            </div>
            <div className="mt-1.5">
              chunk[19] encrypt → upload{" "}
              <span className="text-cyan-600/80 dark:text-cyan-400/80">✓</span>
            </div>
            <div className="mt-1.5 text-[var(--color-text-muted)]">…</div>
            <div className="mt-1.5">
              chunk[23] encrypt → upload{" "}
              <span className="text-cyan-600/80 dark:text-cyan-400/80">✓</span>
            </div>
          </CodePanel>
        }
      />

      {/* ═══ DEVICE-TO-DEVICE ═══ */}
      <section className="pv2-sec pv2-sec-join" aria-labelledby="h-device">
        <div className="pv2-wrap">
          <div className={cn(cardSurface, "overflow-hidden")}>
            <div className="grid gap-0 md:grid-cols-2">
              <div className="p-8 md:p-10">
                <IconWell icon={Smartphone} className="mb-6" />
                <SectionHead
                  id="h-device"
                  eyebrow={deviceToDevice.eyebrow}
                  title={deviceToDevice.heading}
                  lede={deviceToDevice.body}
                  align="left"
                  className="pv2-head-flush pv2-head-col"
                />
                <IconList
                  items={deviceToDevice.checklistItems}
                  icon={Shield}
                  iconStrokeWidth={1.5}
                />
              </div>
              <div className="flex items-center justify-center border-t border-[var(--color-border)] bg-[var(--color-bg)]/60 p-8 md:border-l md:border-t-0">
                <div className="w-full max-w-[240px] text-center">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    <T k="site.features.transfers.d2d.pairingCode" />
                  </div>
                  <div className="mt-3 flex justify-center gap-1.5">
                    {["4", "8", "2", "1", "0", "7"].map((d, i) => (
                      <span
                        key={i}
                        className="flex h-11 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] font-mono text-xl font-semibold text-[var(--pv2-accent-ink)]"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
                    <T k="site.features.transfers.d2d.waiting" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <FeatureFooter related={related} cta={cta} />
    </>
  );
}
