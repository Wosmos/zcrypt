import { pageMetadata } from "@/lib/page-metadata";
import { Link2, Lock, Clock, Download, XCircle, Zap, FileText } from "@/lib/icons";
import { FeatureFooter } from "@/components/marketing/features/feature-footer";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { MockWindowFrame } from "@/components/marketing/features/mock-window";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { CodePanel } from "@/components/marketing/features/code-panel";
import { sharing } from "../_data/sharing";
import { T } from "@/components/i18n/t";
import { SITE_URL } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Encrypted File Sharing. Keys That Stay in the Link",
  description:
    "Share any file with a link whose decryption key lives only in the URL fragment. It never reaches the server. Add a password, an expiry, or a download limit, and revoke anytime. Recipients need no account and decrypt entirely in their browser.",
  path: "/features/sharing",
  keywords: [
    "encrypted file sharing",
    "secure share link",
    "zero-knowledge sharing",
    "password protected share link",
    "expiring download link",
    "burn after reading",
    "anonymous file send",
  ],
  ogTitle: "Encrypted File Sharing | zcrypt",
  ogDescription:
    "Per-file share links where the decryption key lives only in the URL fragment, never on the server. Optional password, expiry, and download limits. Revoke anytime.",
});

const LEAD = "[&_strong]:font-normal [&_strong]:text-cyan-600/80 dark:[&_strong]:text-cyan-400/80";

export default function SharingPage() {
  const {
    hero,
    capabilitiesSection,
    capabilities,
    tieIn,
    moreWaysSection,
    moreWays,
    related,
    cta,
  } = sharing;

  return (
    <>
      {/* ═══ HERO ═══ */}
      <FeatureHero
        {...hero}
        breadcrumb={{
          name: "Sharing",
          path: "/features/sharing",
          parent: "/features/encrypted-drive",
        }}
      >
        {/* Share-link mock */}
        <MockWindowFrame
          maxWidth="max-w-3xl"
          contentClassName="p-4 sm:p-5"
          label={<T k="site.features.sharing.mock.label" />}
          labelIcon={Link2}
          badgeIcon={Lock}
          badgeLabel={<T k="site.features.sharing.mock.badge" />}
        >
          {/* the url, with the fragment highlighted */}
          <div className="rounded-xl border border-[var(--color-border)] bg-black/[0.02] p-3 font-mono text-[11px] leading-relaxed break-all dark:bg-white/[0.02]">
            <span className="text-[var(--color-text-muted)]">{SITE_URL}/s/</span>
            <span className="text-[var(--color-text-secondary)]">3kQ9pX2v</span>
            <span className="text-amber-600 dark:text-amber-400">#key=8f4a…d20e</span>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
            <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-text-muted)]" />
              <span className="font-mono">/s/3kQ9pX2v</span>
              <span>
                <T k="site.features.sharing.mock.sentToServer" />
              </span>
            </div>
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              <span className="font-mono">#key=…</span>
              <span>
                <T k="site.features.sharing.mock.staysInBrowser" />
              </span>
            </div>
          </div>

          {/* link controls */}
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { Icon: Lock, id: "password" },
              { Icon: Clock, id: "expires" },
              { Icon: Download, id: "downloads" },
              { Icon: XCircle, id: "revoke" },
            ].map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]"
              >
                <c.Icon className="h-4 w-4 text-[var(--pv2-accent-ink)]" />
                <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  <T k={`site.features.sharing.mock.${c.id}`} />
                </div>
                <div className="text-xs font-medium">
                  <T k={`site.features.sharing.mock.${c.id}Value`} />
                </div>
              </div>
            ))}
          </div>
        </MockWindowFrame>
      </FeatureHero>

      {/* ═══ CAPABILITIES ═══ */}
      <CapabilityGrid
        id="h-capabilities"
        heading={capabilitiesSection.heading}
        subheading={capabilitiesSection.subheading}
        items={capabilities}
      />

      {/* ═══ WHY THE FRAGMENT MATTERS ═══ */}
      <TieInSection
        join
        {...tieIn}
        panel={
          <CodePanel
            comment={<T k="site.features.sharing.panel.comment" />}
            success={<T k="site.features.sharing.panel.success" />}
          >
            <div className="break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">GET</span> /s/3kQ9pX2v
            </div>
            <div className={"mt-1.5 " + LEAD}>
              <T k="site.features.sharing.panel.returns" />
            </div>
            <div className="mt-1.5 break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">#key=…</span>{" "}
              <span className="text-amber-500">
                <T k="site.features.sharing.panel.notInRequest" />
              </span>
            </div>
            <div className="mt-1.5">
              <T k="site.features.sharing.panel.decryptHappens" />{" "}
              <span className="text-emerald-500">
                <T k="site.features.sharing.panel.browser" />
              </span>
            </div>
          </CodePanel>
        }
      />

      {/* ═══ MORE WAYS TO SEND ═══ */}
      <CapabilityGrid
        id="h-more-ways"
        join
        columns={2}
        heading={moreWaysSection.heading}
        subheading={moreWaysSection.subheading}
        items={[
          { Icon: Zap, ...moreWays[0] },
          { Icon: FileText, ...moreWays[1] },
        ]}
      />

      <FeatureFooter related={related} cta={cta} />
    </>
  );
}
