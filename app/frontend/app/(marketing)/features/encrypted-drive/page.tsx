import { pageMetadata } from "@/lib/page-metadata";
import { Folder, Lock, ChevronRight, Archive, Image as ImageIcon, FileText } from "@/lib/icons";
import { FeatureFooter } from "@/components/marketing/features/feature-footer";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { MockWindowFrame } from "@/components/marketing/features/mock-window";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { CodePanel } from "@/components/marketing/features/code-panel";
import { encryptedDrive } from "../_data/encrypted-drive";
import { T } from "@/components/i18n/t";

export const metadata = pageMetadata({
  title: "Encrypted Cloud Drive. Real Folders & File Explorer",
  description:
    "zcrypt is a real encrypted drive, not a flat bucket of files. Nest folders, drag to organize, search, sort, and switch between grid and list: with every file and even folder names encrypted on your device.",
  path: "/features/encrypted-drive",
  keywords: [
    "encrypted drive",
    "encrypted file manager",
    "private cloud drive",
    "encrypted folders",
    "encrypted file explorer",
    "secure file organization",
    "zero-knowledge drive",
  ],
  ogDescription:
    "A real encrypted drive: nest folders, drag to organize, search and sort: every file and folder name encrypted on your device.",
});

const explorerFolders = [
  { id: "projects", count: 12 },
  { id: "photos", count: 248 },
  { id: "tax", count: 9, locked: true },
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
      {/* ═══ HERO ═══ */}
      <FeatureHero
        {...hero}
        breadcrumb={{
          name: "Encrypted Drive",
          path: "/features/encrypted-drive",
          parent: "/features/encrypted-drive",
        }}
      >
        {/* Explorer mock */}
        <MockWindowFrame
          label={
            <>
              <T k="site.features.encryptedDrive.mock.vault" /> <ChevronRight className="h-3 w-3" />{" "}
              <T k="site.features.encryptedDrive.mock.projects" />
            </>
          }
          badgeIcon={Lock}
          badgeLabel={<T k="site.features.encryptedDrive.mock.unlocked" />}
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {explorerFolders.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-black/[0.02] px-3 py-2.5 dark:bg-white/[0.02]"
              >
                <Folder className="h-5 w-5 flex-shrink-0 text-cyan-500" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 truncate text-xs font-medium">
                    <T k={`site.features.encryptedDrive.mock.${f.id}`} />
                    {f.locked && <Lock className="h-3 w-3 text-amber-500" />}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                    <T k="site.features.encryptedDrive.mock.items" values={{ n: f.count }} />
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

      <CapabilityGrid {...capabilitiesSection} items={capabilities} />

      <TieInSection
        join
        {...tieIn}
        panel={
          <CodePanel
            comment={<T k="site.features.encryptedDrive.panel.comment" />}
            success={<T k="site.features.encryptedDrive.panel.success" />}
          >
            <div className="break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">folder</span>{" "}
              9f2a1c·b8d40e·7c5b13·f0e2a9, sealed
            </div>
            <div className="mt-1.5 break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">folder</span>{" "}
              4d1b6c·8e30dd·91ac0c·77ae3f, sealed
            </div>
            <div className="mt-1.5 break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">file</span>{" "}
              a4f9c1·0c77ae·3f5b2a·4f9c1e, sealed
            </div>
          </CodePanel>
        }
      />

      <FeatureFooter related={related} cta={cta} />
    </>
  );
}
