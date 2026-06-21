"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  Github,
  GitBranch,
  Layers,
  Send,
  Globe,
  Monitor,
  Terminal,
  Lock,
  Check,
  ArrowRight,
  Archive,
  Image,
  Database,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

// ─── Card content ────────────────────────────────────────────
// Brand colors kept on the platform glyphs (same icon mapping the
// rest of the landing uses — see bring-your-own-storage.tsx).
const platforms = [
  { name: "GitHub", limit: "850 MB / repo", Icon: Github, color: "text-[var(--color-text)]" },
  { name: "GitLab", limit: "9 GB / repo", Icon: GitBranch, color: "text-[#fc6d26]" },
  { name: "Hugging Face", limit: "280 GB / repo", Icon: Layers, color: "text-[#ffd21e]" },
  { name: "Telegram", limit: "50 MB / file", Icon: Send, color: "text-[#26a5e4]" },
];

const appTiles = [
  { Icon: Globe, title: "Web app", sub: "Right in your browser", tag: null },
  { Icon: Monitor, title: "Desktop app", sub: "macOS · Windows · Linux", tag: null },
  { Icon: Terminal, title: "Terminal (TUI)", sub: "Single binary, no deps", tag: "CLI" },
];

const vaultFiles = [
  { Icon: Archive, name: "q4-research.tar.zst.enc", meta: "3 chunks · 248 MB" },
  { Icon: Image, name: "photos-2026.zip.enc", meta: "encrypted · 1.2 GB" },
  { Icon: Database, name: "vault-backup.db.enc", meta: "sealed · 86 MB" },
];

const shChecks = [
  "Deploy with Docker in minutes",
  "Full source on GitHub",
  "Hosted version also available",
];

// ─── Shared styles ───────────────────────────────────────────
const cardBase = cn(
  "group relative overflow-hidden h-full rounded-[22px] border border-[var(--color-border)]",
  "bg-gradient-to-b from-[var(--color-surface-1)] to-[var(--color-surface)] p-6 sm:p-7",
  "transition-[border-color,box-shadow] duration-300 hover:border-cyan-500/30",
  "shadow-sm dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_-12px_rgba(0,0,0,0.7)]",
  "hover:shadow-md dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_16px_48px_-16px_rgba(0,0,0,0.7)]"
);

const subtleFill = "bg-black/[0.02] dark:bg-white/[0.02]";

function BentoCard({
  className,
  glow,
  index,
  children,
}: {
  className?: string;
  glow: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className={cn(cardBase, className)}
    >
      {/* hover glow — brightens from 0.5 → 1 on hover (matches mockup .bglow) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: glow }}
      />
      {children}
    </motion.article>
  );
}

function OutlineButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "mt-5 inline-flex w-fit items-center gap-2 self-start rounded-full border border-[var(--color-border)] px-4 py-2",
        "text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/5",
        subtleFill
      )}
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

export function BentoGrid() {
  return (
    <section id="features" className="py-24 px-4 scroll-mt-20">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mx-auto mb-12 max-w-2xl text-center sm:mb-16">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
            Features
          </p>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Built for{" "}
            <span className="inline-block bg-gradient-to-r from-cyan-400 via-cyan-500 to-cyan-700 bg-clip-text pb-1 italic text-transparent dark:from-cyan-300 dark:via-cyan-400 dark:to-cyan-500">
              privacy.
            </span>
          </h2>
          <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">
            Everything engineered so your data stays yours — and you never have to
            take our word for it.
          </p>
        </div>

        {/* Bento */}
        <div className="grid grid-cols-1 items-stretch gap-2.5 md:grid-cols-3">
          {/* Row 1 — Encrypted (wide) */}
          <BentoCard
            index={0}
            glow="radial-gradient(50% 80% at 85% 10%, rgba(0,213,228,0.05), transparent 70%)"
            className="flex flex-col gap-6 md:col-span-2 md:flex-row md:items-center md:gap-8"
          >
            <div className="relative z-[2] min-w-0 md:flex-[0.8]">
              <h3 className="mb-2.5 font-heading text-xl font-semibold leading-tight tracking-tight text-[var(--color-text)] sm:text-[1.4rem]">
                Encrypted before it ever leaves your device
              </h3>
              <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                The key comes from your passphrase and never leaves your device —
                so only you can open your files.
              </p>
              <OutlineButton href="/docs/security">Explore security</OutlineButton>
            </div>
            <div className="relative z-[2] flex min-w-0 flex-col justify-center md:flex-[1.5]">
              {/* mac window — vault preview */}
              <div className="overflow-hidden rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-sm dark:shadow-[0_30px_60px_-28px_rgba(0,0,0,0.9)]">
                <div className={cn("flex items-center gap-1.5 border-b border-[var(--color-border)] px-3.5 py-2.5", subtleFill)}>
                  <i className="block h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <i className="block h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <i className="block h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  <span className="ml-2 font-mono text-[0.68rem] text-[var(--color-text-muted)]">
                    zcrypt — My Vault
                  </span>
                </div>
                <div className="space-y-2 p-3 sm:p-4">
                  {vaultFiles.map(({ Icon, name, meta }) => (
                    <div
                      key={name}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2.5",
                        subtleFill
                      )}
                    >
                      <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-cyan-500/15 bg-cyan-500/10 text-cyan-500">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-[var(--color-text)]">
                          {name}
                        </div>
                        <div className="font-mono text-[0.6rem] text-[var(--color-text-muted)]">
                          {meta}
                        </div>
                      </div>
                      <Lock className="h-3.5 w-3.5 flex-shrink-0 text-cyan-500/70" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </BentoCard>

          {/* Row 1 — Platforms */}
          <BentoCard
            index={1}
            glow="radial-gradient(70% 60% at 50% 0%, rgba(0,213,228,0.05), transparent 70%)"
            className="flex flex-col gap-5"
          >
            <div className="relative z-[2] min-w-0">
              <h3 className="mb-2.5 font-heading text-xl font-semibold leading-tight tracking-tight text-[var(--color-text)] sm:text-[1.4rem]">
                Your storage, your platforms
              </h3>
              <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                Connect the accounts you already own. Nothing lives on our servers.
              </p>
            </div>
            <div className="relative z-[2] flex min-w-0 flex-1 flex-col justify-center">
              <div className="flex flex-col gap-2">
                {platforms.map(({ name, limit, Icon, color }) => (
                  <div
                    key={name}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] px-3 py-2.5",
                      "text-sm font-medium text-[var(--color-text)] transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/5",
                      subtleFill
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg border border-[var(--color-border)]",
                        subtleFill,
                        color
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    {name}
                    <span className="ml-auto font-mono text-[0.68rem] text-[var(--color-text-muted)]">
                      {limit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </BentoCard>

          {/* Row 2 — Apps */}
          <BentoCard
            index={2}
            glow="radial-gradient(70% 60% at 50% 0%, rgba(0,213,228,0.05), transparent 70%)"
            className="flex flex-col gap-5"
          >
            <div className="relative z-[2] min-w-0">
              <h3 className="mb-2.5 font-heading text-xl font-semibold leading-tight tracking-tight text-[var(--color-text)] sm:text-[1.4rem]">
                Web, desktop &amp; terminal
              </h3>
              <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                The same zero-knowledge core, wherever you work.
              </p>
            </div>
            <div className="relative z-[2] flex min-w-0 flex-1 flex-col justify-center">
              <div className="flex flex-col gap-2.5">
                {appTiles.map(({ Icon, title, sub, tag }) => (
                  <div
                    key={title}
                    className={cn(
                      "flex items-center gap-3.5 rounded-xl border border-[var(--color-border)] px-3.5 py-3",
                      "transition-[border-color,transform] duration-200 hover:translate-x-[3px] hover:border-cyan-500/30",
                      subtleFill
                    )}
                  >
                    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] border border-cyan-500/20 bg-cyan-500/10 text-cyan-500">
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                      <b className="block text-sm font-medium text-[var(--color-text)]">
                        {title}
                      </b>
                      <small className="text-[0.73rem] text-[var(--color-text-muted)]">
                        {sub}
                      </small>
                    </div>
                    {tag && (
                      <span className="ml-auto rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-[0.6rem] text-[var(--color-text-muted)]">
                        {tag}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </BentoCard>

          {/* Row 2 — Self-host (wide, reversed) */}
          <BentoCard
            index={3}
            glow="radial-gradient(40% 90% at 12% 50%, rgba(0,213,228,0.05), transparent 70%)"
            className="flex flex-col gap-6 md:col-span-2 md:flex-row-reverse md:items-center md:gap-8"
          >
            <div className="relative z-[2] min-w-0 md:flex-1">
              <h3 className="mb-2.5 font-heading text-xl font-semibold leading-tight tracking-tight text-[var(--color-text)] sm:text-[1.4rem]">
                Runs where you decide
              </h3>
              <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                Audit every line, or run the entire backend on your own
                infrastructure. Bring-your-own-backend is available to everyone —
                your trust is earned by code you can read.
              </p>
              <ul className="mt-5 flex flex-col gap-2.5">
                {shChecks.map((c) => (
                  <li
                    key={c}
                    className="flex items-center gap-2.5 text-sm text-[var(--color-text-secondary)]"
                  >
                    <Check className="h-4 w-4 flex-shrink-0 text-cyan-500" strokeWidth={3} />
                    {c}
                  </li>
                ))}
              </ul>
              <OutlineButton href="/docs">Read the docs</OutlineButton>
            </div>
            <div className="relative z-[2] flex min-w-0 flex-col justify-center md:flex-1">
              {/* deployment mock */}
              <div
                className="flex min-h-[170px] flex-col gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-5"
                style={{
                  backgroundImage:
                    "radial-gradient(120% 100% at 20% 0%, rgba(0,213,228,0.05), transparent 60%)",
                }}
              >
                <span className="mb-1 w-fit self-start rounded-full border border-[var(--color-border)] px-2.5 py-1 font-mono text-[0.62rem] tracking-wider text-[var(--color-text-secondary)]">
                  DEPLOYMENT
                </span>
                <div className={cn("flex h-[34px] items-center rounded-lg border border-[var(--color-border)] px-3", subtleFill)}>
                  <span className="h-1.5 w-[55%] rounded-full bg-[var(--color-surface-3)]" />
                </div>
                <div className={cn("flex h-[34px] items-center rounded-lg border border-cyan-500/30 px-3", subtleFill)}>
                  <span className="h-1.5 w-[55%] rounded-full bg-cyan-500" />
                  <Check className="ml-auto h-3.5 w-3.5 text-cyan-400" strokeWidth={3} />
                </div>
                <div className={cn("flex h-[34px] items-center rounded-lg border border-[var(--color-border)] px-3", subtleFill)}>
                  <span className="h-1.5 w-[38%] rounded-full bg-[var(--color-surface-3)]" />
                </div>
              </div>
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
