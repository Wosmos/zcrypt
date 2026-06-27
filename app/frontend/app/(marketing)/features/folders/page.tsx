import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  Folder,
  FolderOpen,
  Lock,
  Unlock,
  Key,
  Layers,
  RefreshCw,
  Check,
  Shield,
  FileText,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

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

const capabilities = [
  {
    Icon: FolderOpen,
    title: "Real, nestable folders",
    desc: "Build the hierarchy you actually think in — folders inside folders, as deep as you need. Not tags pretending to be structure.",
  },
  {
    Icon: Lock,
    title: "Encrypted folder names",
    desc: "Every folder name is encrypted on your device. The server stores opaque ciphertext — it never learns what you called anything.",
  },
  {
    Icon: Key,
    title: "A password per folder",
    desc: "Give any folder its own password, separate from your vault passphrase. It guards the most sensitive corners on its own terms.",
  },
  {
    Icon: Shield,
    title: "Sealed independently",
    desc: "A protected folder stays locked even while the rest of your vault is open. Unlocking your vault is not the same as unlocking it.",
  },
  {
    Icon: RefreshCw,
    title: "Automatic re-keying",
    desc: "Move a file into or out of a protected folder and it is re-encrypted under the right key automatically. No manual steps, no leaks.",
  },
  {
    Icon: Layers,
    title: "Verified locally",
    desc: "The folder password is checked on your device against the folder's own key material — never sent to the server, never round-tripped.",
  },
];

const treeLines = [
  { depth: 0, Icon: FolderOpen, name: "My Vault", meta: "root", open: true },
  { depth: 1, Icon: Folder, name: "Projects", meta: "12 items" },
  { depth: 1, Icon: Folder, name: "Photos 2026", meta: "248 items" },
  { depth: 1, Icon: Lock, name: "Tax & legal", meta: "sealed", locked: true },
  { depth: 2, Icon: Lock, name: "··········", meta: "password required", locked: true, child: true },
];

export default function FoldersPage() {
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
      <section className="relative overflow-hidden px-6 pt-32 pb-16 md:pt-36">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
        </div>
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            Encrypted folders
          </p>
          <h1 className="font-heading text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
            Folders that can
            <br />
            <span className="bg-gradient-to-r from-cyan-500 to-cyan-400 bg-clip-text italic text-transparent dark:from-cyan-400 dark:to-cyan-300">
              lock themselves.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            Organize with real, nestable folders whose names are encrypted on your
            device. Then give any folder its own password — a second lock, separate
            from your vault, that keeps it sealed even when everything else is open.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-8 py-3.5 text-base font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50"
            >
              Create your vault
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs/folder-encryption"
              className="inline-flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)]"
            >
              Read the docs
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Folder-tree mock */}
        <div className="mx-auto mt-16 max-w-2xl">
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl shadow-black/20 dark:shadow-black/40">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-black/[0.02] px-4 py-3 dark:bg-white/[0.02]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              <div className="ml-3 font-mono text-[11px] text-[var(--color-text-muted)]">
                Folder tree
              </div>
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
                <Unlock className="h-2.5 w-2.5" /> Vault unlocked
              </span>
            </div>
            <div className="p-3 sm:p-4">
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
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CAPABILITIES ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              Structure that keeps secrets
            </h2>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              The folders you expect, plus a second layer of encryption you can drop
              onto any one of them — all the way down.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ Icon, title, desc }) => (
              <div
                key={title}
                className="card p-6 transition-colors hover:border-cyan-500/30"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW THE FOLDER KEY WORKS ═══ */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-20">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
              A lock within the lock
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
              A key the server never sees
            </h2>
            <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
              When you protect a folder, its files are re-encrypted under a key derived
              from a password only you know. That password is verified locally against
              the folder&apos;s own key material — it never travels to the server, and
              neither does the key it unlocks. Move a file in or out and zcrypt re-keys
              it for you, so nothing is ever left under the wrong lock.
            </p>
            <ul className="mt-6 space-y-2.5">
              {[
                "Folder password derived to a key on your device",
                "Verified locally — no server round-trip, no guess oracle",
                "Stays sealed even while your vault is unlocked",
                "Files re-encrypted automatically when moved in or out",
              ].map((c) => (
                <li
                  key={c}
                  className="flex items-center gap-2.5 text-sm text-[var(--color-text-secondary)]"
                >
                  <Check className="h-4 w-4 flex-shrink-0 text-cyan-500" strokeWidth={3} />
                  {c}
                </li>
              ))}
            </ul>
            <Link
              href="/docs/folder-encryption"
              className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 transition-all hover:gap-2.5 dark:text-cyan-400"
            >
              How folder encryption works
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5 font-mono text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            <div className="mb-2 text-[var(--color-text-secondary)]">
              // unlocking a protected folder
            </div>
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
            <div className="mt-4 text-emerald-500">
              ✓ password never sent. key never sent.
            </div>
          </div>
        </div>
      </section>

      {/* ═══ RELATED + CTA ═══ */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 font-heading text-xl font-bold">Keep exploring</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                href: "/features/encrypted-drive",
                title: "The encrypted drive",
                desc: "Folders, search, previews, drag-and-drop — encrypted end to end.",
                Icon: FolderOpen,
              },
              {
                href: "/docs/folders",
                title: "Docs: Folders",
                desc: "Create, nest, move, and rename folders in your vault.",
                Icon: Folder,
              },
              {
                href: "/docs/folder-encryption",
                title: "Docs: Folder encryption",
                desc: "How per-folder passwords and re-keying work under the hood.",
                Icon: FileText,
              },
            ].map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="card group p-5 transition-colors hover:border-cyan-500/40"
              >
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  {r.title}
                  <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 transition-opacity group-hover:opacity-100" />
                </h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {r.desc}
                </p>
              </Link>
            ))}
          </div>

          <div className="mt-16 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
            <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Lock the folders that matter most
            </h2>
            <p className="mx-auto mt-3 max-w-md text-[var(--color-text-secondary)]">
              Free and open source. Organize your vault and seal any folder with a
              password of its own.
            </p>
            <Link
              href="/register"
              className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-8 py-3.5 text-base font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50"
            >
              Create your vault
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
