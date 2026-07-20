import type { Metadata } from "next";
import { Folder, FolderOpen, Lock, Unlock } from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { MockWindowFrame } from "@/components/marketing/features/mock-window";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { IconList } from "@/components/marketing/features/icon-list";
import { CodePanel } from "@/components/marketing/features/code-panel";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";
import { folders } from "../_data/folders";

export const metadata: Metadata = {
  title: "Encrypted, Password-Protected Folders",
  description:
    "Real nestable folders with encrypted names — and any folder can have its own password, separate from your vault passphrase. Files inside are re-encrypted under a folder-specific key, verified locally, and stay sealed even when the rest of your vault is unlocked.",
  keywords: [
    "password protected folders",
    "encrypted folders",
    "folder encryption",
    "nested encrypted folders",
    "per-folder password",
    "zero-knowledge folders",
    "encrypted folder names",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features/folders" },
  openGraph: {
    title: "Encrypted, Password-Protected Folders | zcrypt",
    description:
      "Nestable folders with encrypted names, where any folder can have its own password — files re-encrypted under a folder key that never reaches the server.",
    url: "https://zcrypt.cloud/features/folders",
    type: "website",
  },
};

const treeLines = [
  { depth: 0, Icon: FolderOpen, name: "My Vault", meta: "root", open: true },
  { depth: 1, Icon: Folder, name: "Projects", meta: "12 items" },
  { depth: 1, Icon: Folder, name: "Photos 2026", meta: "248 items" },
  { depth: 1, Icon: Lock, name: "Tax & legal", meta: "sealed", locked: true },
  { depth: 2, Icon: Lock, name: "··········", meta: "password required", locked: true, child: true },
];

export default function FoldersPage() {
  const { hero, capabilitiesSection, capabilities, tieIn, related, cta } = folders;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/encrypted-drive" },
          { name: "Folders", url: "https://zcrypt.cloud/features/folders" },
        ]}
      />

      {/* ═══ HERO ═══ */}
      <FeatureHero
        eyebrow={hero.eyebrow}
        headlineTop={hero.headlineTop}
        headlineGradient={hero.headlineGradient}
        subtext={hero.subtext}
        secondaryLabel={hero.secondaryLabel}
        secondaryHref={hero.secondaryHref}
      >
        {/* Folder-tree mock */}
        <MockWindowFrame
          maxWidth="max-w-2xl"
          label="Folder tree"
          badgeIcon={Unlock}
          badgeLabel="Vault unlocked"
        >
          <div className="space-y-1.5">
            {treeLines.map((row, i) => (
              <div
                key={i}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${
                  row.locked
                    ? "border-amber-500/30 bg-amber-500/[0.06]"
                    : "border-[var(--color-border)] bg-black/[0.02] dark:bg-white/[0.02]"
                }`}
                style={{ marginLeft: row.depth * 22 }}
              >
                <row.Icon
                  className={`h-5 w-5 flex-shrink-0 ${
                    row.locked ? "text-amber-500" : "text-cyan-500"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{row.name}</div>
                  <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                    {row.meta}
                  </div>
                </div>
                {row.locked && !row.child && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    <Lock className="h-2.5 w-2.5" /> Password
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 px-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            The vault is open, but{" "}
            <span className="text-amber-600 dark:text-amber-400">Tax &amp; legal</span>{" "}
            stays sealed until you enter its own password.
          </p>
        </MockWindowFrame>
      </FeatureHero>

      {/* ═══ CAPABILITIES ═══ */}
      <CapabilityGrid
        heading={capabilitiesSection.heading}
        subheading={capabilitiesSection.subheading}
        items={capabilities}
      />

      {/* ═══ HOW THE FOLDER KEY WORKS ═══ */}
      <TieInSection
        sectionClassName="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20"
        eyebrow={tieIn.eyebrow}
        heading={tieIn.heading}
        body={tieIn.body}
        checklist={<IconList items={tieIn.checklistItems} />}
        linkLabel={tieIn.linkLabel}
        linkHref={tieIn.linkHref}
        panel={
          <CodePanel
            comment="// unlocking a protected folder"
            success="✓ password never sent. key never sent."
          >
            <div>
              <span className="text-cyan-600/80 dark:text-cyan-400/80">on device</span>{" "}
              password → derive folder key
            </div>
            <div className="mt-1.5">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">verify</span> key
              against sealed marker — locally
            </div>
            <div className="mt-1.5 break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">folder</span>{" "}
              7c5b13·f0e2a9·9f2a1c·b8d40e — sealed
            </div>
            <div className="mt-1.5 text-[var(--color-text-muted)]">
              server receives: <span className="text-amber-500">nothing</span>
            </div>
          </CodePanel>
        }
      />

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <RelatedLinks heading="Keep exploring" items={related} />
          <CtaSection heading={cta.heading} subtext={cta.subtext} />
        </div>
      </section>
    </>
  );
}
