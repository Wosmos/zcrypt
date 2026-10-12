import { pageMetadata } from "@/lib/page-metadata";
import { Box, Lock, Server } from "@/lib/icons";
import { FeatureFooter } from "@/components/marketing/features/feature-footer";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { MockWindowFrame } from "@/components/marketing/features/mock-window";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { CodePanel } from "@/components/marketing/features/code-panel";
import { STORAGE_PLATFORMS } from "@/components/marketing/landing/storage-platforms";
import { bringYourOwnStorage } from "../_data/bring-your-own-storage";
import { T } from "@/components/i18n/t";

export const metadata = pageMetadata({
  title: "Bring Your Own Storage. Your Data, Your Infrastructure",
  description:
    "zcrypt never sells you storage. Connect accounts you already own (GitHub, GitLab, Hugging Face, Telegram) and your encrypted files are stored as disguised chunks in repos you own. Repos rotate automatically as they fill, so your space grows on its own. No lock-in.",
  path: "/features/bring-your-own-storage",
  keywords: [
    "bring your own storage",
    "BYO storage",
    "self-hosted encrypted storage",
    "github as storage",
    "no vendor lock-in",
    "decentralized file storage",
    "encrypted storage backend",
  ],
  ogTitle: "Bring Your Own Storage | zcrypt",
  ogDescription:
    "Connect GitHub, GitLab, Hugging Face, and Telegram accounts you already own. Encrypted files are stored as disguised chunks across repos you own, and repos rotate automatically as they fill. Your data, your infrastructure, no lock-in.",
});

const adapters = STORAGE_PLATFORMS;

export default function BringYourOwnStoragePage() {
  const { hero, adaptersSection, capabilities, tieIn, related, cta } = bringYourOwnStorage;

  return (
    <>
      {/* ═══ HERO ═══ */}
      <FeatureHero
        {...hero}
        breadcrumb={{
          name: "Bring your own storage",
          path: "/features/bring-your-own-storage",
          parent: "/features/encrypted-drive",
        }}
      >
        {/* Adapters mock */}
        <MockWindowFrame
          label={<T k="site.features.byos.mock.label" />}
          labelIcon={Server}
          badgeIcon={Lock}
          badgeLabel={<T k="site.features.byos.mock.badge" />}
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {adapters.map((a) => (
              <div
                key={a.name}
                className="rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-3 dark:bg-white/[0.02]"
              >
                <a.Mark className="h-5 w-5" />
                <div className="mt-2 text-xs font-semibold">{a.name}</div>
                <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                  <T k={`site.features.byos.platforms.${a.id}.capacity`} />
                </div>
              </div>
            ))}
          </div>
          {/* chunk fan-out row */}
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]">
            <Box className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
            <div className="flex flex-wrap gap-1.5 font-mono text-[10px] text-[var(--color-text-muted)]">
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-600 dark:text-cyan-400">
                chunk-01
              </span>
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-600 dark:text-cyan-400">
                chunk-02
              </span>
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-cyan-600 dark:text-cyan-400">
                chunk-03
              </span>
              <span className="text-[var(--color-text-muted)]">
                <T k="site.features.byos.mock.storedAs" />
              </span>
            </div>
          </div>
        </MockWindowFrame>
      </FeatureHero>

      {/* ═══ ADAPTERS DETAIL ═══ */}
      <CapabilityGrid
        id="h-adapters"
        eyebrow={adaptersSection.eyebrow}
        heading={adaptersSection.heading}
        subheading={adaptersSection.subheading}
        columns={4}
        footnote={adaptersSection.footnote}
        items={adapters.map((a) => ({
          Icon: a.Mark,
          title: a.name,
          desc: (
            <>
              <span className="mb-1.5 block font-mono text-xs text-[var(--pv2-accent-ink)]">
                <T k={`site.features.byos.platforms.${a.id}.capacity`} />
              </span>
              <T k={`site.features.byos.platforms.${a.id}.note`} />
            </>
          ),
        }))}
      />

      {/* ═══ HOW IT GROWS ═══ */}
      <CapabilityGrid id="h-capabilities" items={capabilities} join />

      {/* ═══ OWNERSHIP TIE-IN ═══ */}
      <TieInSection
        {...tieIn}
        panel={
          <CodePanel
            comment={<T k="site.features.byos.panel.comment" />}
            success={<T k="site.features.byos.panel.success" />}
          >
            <div>
              <span className="text-cyan-600/80 dark:text-cyan-400/80">1</span>{" "}
              <T k="site.features.byos.panel.step1" />
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">2</span>{" "}
              <T k="site.features.byos.panel.step2" />
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">3</span>{" "}
              <T k="site.features.byos.panel.step3" />{" "}
              <span className="text-[var(--color-text-secondary)]">build-cache-*.bin</span>
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">4</span>{" "}
              <T k="site.features.byos.panel.step4" />
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">5</span>{" "}
              <T k="site.features.byos.panel.step5" />{" "}
              <span className="text-amber-500">
                <T k="site.features.byos.panel.rotate" />
              </span>{" "}
              <T k="site.features.byos.panel.fresh" />
            </div>
          </CodePanel>
        }
      />

      <FeatureFooter related={related} cta={cta} />
    </>
  );
}
