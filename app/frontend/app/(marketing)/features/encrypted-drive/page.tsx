import type { Metadata } from "next";
import { Folder, Lock, ChevronRight, Archive, Image as ImageIcon, FileText } from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { MockWindowFrame } from "@/components/marketing/features/mock-window";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { IconList } from "@/components/marketing/features/icon-list";
import { CodePanel } from "@/components/marketing/features/code-panel";
import { RelatedLinks } from "@/components/marketing/features/related-links";
import { CtaSection } from "@/components/marketing/features/cta-section";
import { encryptedDrive } from "../_data/encrypted-drive";

export const metadata: Metadata = {
  title: "Encrypted Cloud Drive — Real Folders & File Explorer",
  description:
    "zcrypt is a real encrypted drive, not a flat bucket of files. Nest folders, drag to organize, search, sort, and switch between grid and list — with every file and even folder names encrypted on your device.",
  keywords: [
    "encrypted drive",
    "encrypted file manager",
    "private cloud drive",
    "encrypted folders",
    "encrypted file explorer",
    "secure file organization",
    "zero-knowledge drive",
  ],
  alternates: { canonical: "https://zcrypt.cloud/features/encrypted-drive" },
  openGraph: {
    title: "Encrypted Cloud Drive — Real Folders & File Explorer | zcrypt",
    description:
      "A real encrypted drive: nest folders, drag to organize, search and sort — every file and folder name encrypted on your device.",
    url: "https://zcrypt.cloud/features/encrypted-drive",
    type: "website",
  },
};

const explorerFolders = [
  { name: "Projects", count: "12 items" },
  { name: "Photos 2026", count: "248 items" },
  { name: "Tax & legal", count: "9 items", locked: true },
];

const explorerFiles = [
  { Icon: Archive, name: "q4-research.tar.zst", meta: "248 MB" },
  { Icon: ImageIcon, name: "cover-shot.png", meta: "4.1 MB" },
  { Icon: FileText, name: "contract-final.pdf", meta: "820 KB" },
];

export default function EncryptedDrivePage() {
  const { hero, capabilitiesSection, capabilities, tieIn, related, cta } = encryptedDrive;

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Features", url: "https://zcrypt.cloud/features/encrypted-drive" },
          { name: "Encrypted Drive", url: "https://zcrypt.cloud/features/encrypted-drive" },
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
        {/* Explorer mock */}
        <MockWindowFrame
          label={
            <>
              My Vault <ChevronRight className="h-3 w-3" /> Projects
            </>
          }
          badgeIcon={Lock}
          badgeLabel="Unlocked"
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {explorerFolders.map((f) => (
              <div
                key={f.name}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]"
              >
                <Folder className="h-5 w-5 flex-shrink-0 text-cyan-500" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 truncate text-xs font-medium">
                    {f.name}
                    {f.locked && <Lock className="h-3 w-3 text-amber-500" />}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                    {f.count}
                  </div>
                </div>
              </div>
            ))}
            {explorerFiles.map((f) => (
              <div
                key={f.name}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]"
              >
                <f.Icon className="h-5 w-5 flex-shrink-0 text-[var(--color-text-muted)]" />
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">{f.name}</div>
                  <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                    {f.meta}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </MockWindowFrame>
      </FeatureHero>

      {/* ═══ CAPABILITIES ═══ */}
      <CapabilityGrid
        heading={capabilitiesSection.heading}
        subheading={capabilitiesSection.subheading}
        items={capabilities}
      />

      {/* ═══ PRIVACY TIE-IN ═══ */}
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
            comment="// what the server stores"
            success="✓ folder names sealed · keys never sent · contents encrypted"
          >
            <div className="break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">folder</span> 9f2a1c·b8d40e·7c5b13·f0e2a9 — sealed
            </div>
            <div className="mt-1.5 break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">folder</span> 4d1b6c·8e30dd·91ac0c·77ae3f — sealed
            </div>
            <div className="mt-1.5 break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">file</span> a4f9c1·0c77ae·3f5b2a·4f9c1e — sealed
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
