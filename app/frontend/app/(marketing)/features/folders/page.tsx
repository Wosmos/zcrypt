import { pageMetadata } from "@/lib/page-metadata";
import { Folder, FolderOpen, Lock, Unlock } from "@/lib/icons";
import { FeatureFooter } from "@/components/marketing/features/feature-footer";
import { FeatureHero } from "@/components/marketing/features/feature-hero";
import { CapabilityGrid } from "@/components/marketing/features/capability-grid";
import { MockWindowFrame } from "@/components/marketing/features/mock-window";
import { TieInSection } from "@/components/marketing/features/tie-in-section";
import { CodePanel } from "@/components/marketing/features/code-panel";
import { folders } from "../_data/folders";
import { T } from "@/components/i18n/t";

export const metadata = pageMetadata({
  title: "Encrypted, Password-Protected Folders",
  description:
    "Real nestable folders with encrypted names, and any folder can have its own password, separate from your vault passphrase. Files inside are re-encrypted under a folder-specific key, verified locally, and stay sealed even when the rest of your vault is unlocked.",
  path: "/features/folders",
  keywords: [
    "password protected folders",
    "encrypted folders",
    "folder encryption",
    "nested encrypted folders",
    "per-folder password",
    "zero-knowledge folders",
    "encrypted folder names",
  ],
  ogDescription:
    "Nestable folders with encrypted names, where any folder can have its own password: files re-encrypted under a folder key that never reaches the server.",
});

const treeLines = [
  {
    depth: 0,
    Icon: FolderOpen,
    name: <T k="site.features.folders.mock.root" />,
    meta: <T k="site.features.folders.mock.rootMeta" />,
  },
  {
    depth: 1,
    Icon: Folder,
    name: <T k="site.features.folders.mock.projects" />,
    meta: <T k="site.features.folders.mock.items" values={{ n: 12 }} />,
  },
  {
    depth: 1,
    Icon: Folder,
    name: <T k="site.features.folders.mock.photos" />,
    meta: <T k="site.features.folders.mock.items" values={{ n: 248 }} />,
  },
  {
    depth: 1,
    Icon: Lock,
    name: <T k="site.features.folders.mock.tax" />,
    meta: <T k="site.features.folders.mock.sealed" />,
    locked: true,
  },
  {
    depth: 2,
    Icon: Lock,
    name: "··········",
    meta: <T k="site.features.folders.mock.passwordRequired" />,
    locked: true,
    child: true,
  },
];

const LEAD = "[&_strong]:font-normal [&_strong]:text-cyan-600/80 dark:[&_strong]:text-cyan-400/80";

export default function FoldersPage() {
  const { hero, capabilitiesSection, capabilities, tieIn, related, cta } = folders;

  return (
    <>
      {/* ═══ HERO ═══ */}
      <FeatureHero
        {...hero}
        breadcrumb={{
          name: "Folders",
          path: "/features/folders",
          parent: "/features/encrypted-drive",
        }}
      >
        {/* Folder-tree mock */}
        <MockWindowFrame
          maxWidth="max-w-2xl"
          label={<T k="site.features.folders.mock.label" />}
          badgeIcon={Unlock}
          badgeLabel={<T k="site.features.folders.mock.badge" />}
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
                    <Lock className="h-2.5 w-2.5" /> <T k="site.features.folders.mock.password" />
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 px-1 text-[11px] leading-relaxed text-[var(--color-text-muted)] [&_em]:not-italic [&_em]:text-amber-600 dark:[&_em]:text-amber-400">
            <T k="site.features.folders.mock.note" />
          </p>
        </MockWindowFrame>
      </FeatureHero>

      <CapabilityGrid {...capabilitiesSection} items={capabilities} />

      {/* ═══ HOW THE FOLDER KEY WORKS ═══ */}
      <TieInSection
        join
        {...tieIn}
        panel={
          <CodePanel
            comment={<T k="site.features.folders.panel.comment" />}
            success={<T k="site.features.folders.panel.success" />}
          >
            <div className={LEAD}>
              <T k="site.features.folders.panel.line1" />
            </div>
            <div className={"mt-1.5 " + LEAD}>
              <T k="site.features.folders.panel.line2" />
            </div>
            <div className="mt-1.5 break-all">
              <span className="text-cyan-600/80 dark:text-cyan-400/80">folder</span>{" "}
              7c5b13·f0e2a9·9f2a1c·b8d40e, sealed
            </div>
            <div className="mt-1.5 text-[var(--color-text-muted)]">
              <T k="site.features.folders.panel.line3" />{" "}
              <span className="text-amber-500">
                <T k="site.features.folders.panel.nothing" />
              </span>
            </div>
          </CodePanel>
        }
      />

      <FeatureFooter related={related} cta={cta} />
    </>
  );
}
