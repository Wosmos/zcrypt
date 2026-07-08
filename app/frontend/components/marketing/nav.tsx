"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
} from "motion/react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";
import {
  Sun,
  Moon,
  Menu,
  X,
  ArrowRight,
  ChevronDown,
  HardDrive,
  FolderOpen,
  Eye,
  Share2,
  Lock,
  RefreshCcw,
  Send,
  FileText,
  Rocket,
  Key,
  Shield,
  Server,
  Code,
  Download,
} from "@/lib/icons";
import { Logo } from "@/components/ui/logo";

type IconType = React.ComponentType<{ className?: string; size?: number }>;
type MenuItem = { href: string; title: string; desc?: string; icon?: IconType };

// ─── Mega-menu content ───────────────────────────────────────
const productFeatures: MenuItem[] = [
  { href: "/features/encrypted-drive", icon: HardDrive, title: "Encrypted drive", desc: "Folders, search & previews — a real explorer." },
  { href: "/features/folders", icon: FolderOpen, title: "Encrypted folders", desc: "Nestable folders with their own passwords." },
  { href: "/features/file-viewers", icon: Eye, title: "File viewers", desc: "Preview files without downloading them." },
  { href: "/features/sharing", icon: Share2, title: "Sharing", desc: "Links with passwords, expiry & limits." },
  { href: "/features/encryption", icon: Lock, title: "Zero-knowledge encryption", desc: "AES-256-GCM, on your device." },
  { href: "/features/bring-your-own-storage", icon: RefreshCcw, title: "Bring your own storage", desc: "GitHub, GitLab, Hugging Face, Telegram." },
];

const productTools: MenuItem[] = [
  { href: "/send", icon: Send, title: "Send a file", desc: "Encrypted one-off sharing." },
  { href: "/pad", icon: FileText, title: "Encrypted notepad", desc: "Private, zero-knowledge notes." },
  { href: "/transfer", icon: RefreshCcw, title: "Device transfer", desc: "Move files between devices." },
];

const productCompare: MenuItem[] = [
  { href: "/vs/proton-drive", title: "vs Proton Drive" },
  { href: "/vs/dropbox", title: "vs Dropbox" },
  { href: "/vs/google-drive", title: "vs Google Drive" },
];

const docsStart: MenuItem[] = [
  { href: "/docs/getting-started", icon: Rocket, title: "Quickstart", desc: "Set up and upload your first file." },
  { href: "/docs/concepts", icon: Key, title: "Core concepts", desc: "Vault, passphrase, folders, chunks." },
  { href: "/docs/connect-storage", icon: HardDrive, title: "Connect storage", desc: "Link a backend you already own." },
];

const docsPopular: MenuItem[] = [
  { href: "/docs/folders", icon: FolderOpen, title: "Folders & files", desc: "Organize your drive." },
  { href: "/docs/security", icon: Shield, title: "Security model", desc: "How the encryption works." },
  { href: "/docs/self-hosting", icon: Server, title: "Self-hosting", desc: "Run zcrypt with Docker." },
  { href: "/docs/api", icon: Code, title: "API reference", desc: "Endpoints, auth & events." },
];

// ─── Shared mega-menu pieces ─────────────────────────────────
function MegaItem({ item, onClick }: { item: MenuItem; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      role="menuitem"
      onClick={onClick}
      className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-[var(--color-surface-1)]"
    >
      {Icon && (
        <span className="mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-500 transition-colors group-hover:bg-cyan-500/15">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-[var(--color-text)]">{item.title}</span>
        {item.desc && (
          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--color-text-muted)]">{item.desc}</span>
        )}
      </span>
    </Link>
  );
}

function MegaHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
      {children}
    </p>
  );
}

function MegaCtaLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold text-cyan-600 transition-all hover:gap-2.5 hover:bg-cyan-500/8 dark:text-cyan-400"
    >
      {children}
      <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

function FeaturedCard({
  href,
  tag,
  title,
  desc,
  cta,
  onClick,
}: {
  href: string;
  tag: string;
  title: string;
  desc: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-cyan-500/20 bg-[#060b16] p-6"
    >
      {/* Glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-cyan-500/20 blur-3xl transition-opacity duration-500 group-hover:opacity-150" />
        <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-violet-500/10 blur-2xl" />
      </div>

      <div className="relative flex-1">
        <span className="inline-flex items-center rounded-full bg-cyan-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-400">
          {tag}
        </span>
        <h4 className="mt-5 font-heading text-base font-bold leading-snug text-white">{title}</h4>
        <p className="mt-2 text-[12px] leading-relaxed text-white/50">{desc}</p>
      </div>

      <div className="relative mt-6 flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/8 px-4 py-3 text-[12px] font-semibold text-cyan-300 transition-colors group-hover:border-cyan-500/35 group-hover:bg-cyan-500/15">
        {cta}
        <ArrowRight className="ml-auto h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function ProductMega({ onItem }: { onItem: () => void }) {
  return (
    <div className="flex flex-1">
      {/* Features — widest column */}
      <div className="flex flex-[2] flex-col justify-between border-r border-[var(--color-border)] px-6 py-7">
        <div>
          <MegaHeading>Features</MegaHeading>
          <ul className="grid grid-cols-2 gap-0.5 list-none">
            {productFeatures.map((i) => (
              <li key={i.href}>
                <MegaItem item={i} onClick={onItem} />
              </li>
            ))}
          </ul>
        </div>
        <MegaCtaLink href="/features" onClick={onItem}>All features</MegaCtaLink>
      </div>

      {/* Tools + Compare */}
      <div className="flex flex-1 flex-col justify-between border-r border-[var(--color-border)] px-6 py-7">
        <div>
          <MegaHeading>Tools</MegaHeading>
          <ul className="flex flex-col gap-0.5 list-none">
            {productTools.map((i) => (
              <li key={i.href}>
                <MegaItem item={i} onClick={onItem} />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <MegaHeading>Compare</MegaHeading>
          <ul className="flex flex-col gap-0.5 list-none">
            {productCompare.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  role="menuitem"
                  onClick={onItem}
                  className="block rounded-xl px-3 py-2 text-[12px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                >
                  {i.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Featured card */}
      <div className="flex-1 p-5">
        <FeaturedCard
          href="/features/encrypted-drive"
          tag="Featured"
          title="The encrypted drive you actually own"
          desc="Real folders, instant previews, and zero-knowledge encryption — on every platform."
          cta="Explore the drive"
          onClick={onItem}
        />
      </div>
    </div>
  );
}

function DocsMega({ onItem }: { onItem: () => void }) {
  return (
    <div className="flex flex-1">
      {/* Start here */}
      <div className="flex flex-1 flex-col justify-between border-r border-[var(--color-border)] px-6 py-7">
        <div>
          <MegaHeading>Start here</MegaHeading>
          <ul className="flex flex-col gap-0.5 list-none">
            {docsStart.map((i) => (
              <li key={i.href}>
                <MegaItem item={i} onClick={onItem} />
              </li>
            ))}
          </ul>
        </div>
        <MegaCtaLink href="/docs" onClick={onItem}>Open the docs</MegaCtaLink>
      </div>

      {/* Popular */}
      <div className="flex flex-1 flex-col border-r border-[var(--color-border)] px-6 py-7">
        <MegaHeading>Popular</MegaHeading>
        <ul className="flex flex-1 flex-col justify-between gap-0.5 list-none">
          {docsPopular.map((i) => (
            <li key={i.href}>
              <MegaItem item={i} onClick={onItem} />
            </li>
          ))}
        </ul>
      </div>

      {/* Featured card */}
      <div className="flex-1 p-5">
        <FeaturedCard
          href="/docs/api"
          tag="New"
          title="API reference"
          desc="REST endpoints, authentication, and the SSE event stream — fully documented."
          cta="Read the API docs"
          onClick={onItem}
        />
      </div>
    </div>
  );
}

// ─── Nav ─────────────────────────────────────────────────────
const MEGA_MENUS = [
  { key: "product", label: "Product" },
  { key: "docs", label: "Docs" },
] as const;

type MegaKey = (typeof MEGA_MENUS)[number]["key"];

export function MarketingNav() {
  const pathname = usePathname();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<MegaKey | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 40));

  const openMega = (k: MegaKey) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openTimer.current) clearTimeout(openTimer.current);
    // Already showing a menu → switch immediately (no flicker between items)
    if (openMenu !== null) {
      setOpenMenu(k);
    } else {
      openTimer.current = setTimeout(() => setOpenMenu(k), 160);
    }
  };
  const scheduleClose = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenMenu(null), 140);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  // Close on route change.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const triggerClass = (active: boolean) =>
    cn(
      "flex items-center gap-1 px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-200",
      active
        ? "text-[var(--color-text)] bg-[var(--color-surface-1)]"
        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-1)]/60"
    );

  return (
    <>
      <div className="h-4" />

      <header className="fixed top-0 left-0 right-0 z-50 pointer-events-none pt-3 px-4 sm:px-6 lg:px-8">
        <div className="relative mx-auto max-w-6xl">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={cn(
              "pointer-events-auto flex items-center justify-between rounded-3xl corner-squircle border px-3 py-2 transition-all duration-300",
              scrolled || openMenu
                ? "nav-glass border-[rgba(0,213,228,0.18)]"
                : "border-transparent bg-transparent"
            )}
          >
            {/* Logo */}
            <Link href="/" aria-label="zcrypt home" className="flex items-center">
              <Logo size="lg" />
            </Link>

            {/* Center nav */}
            <nav
              className="hidden items-center gap-0.5 md:flex"
              onMouseLeave={scheduleClose}
            >
              <Link
                href="/"
                className={cn(triggerClass(pathname === "/"))}
              >
                Home
              </Link>

              {MEGA_MENUS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onMouseEnter={() => openMega(m.key)}
                  onClick={() => setOpenMenu((o) => (o === m.key ? null : m.key))}
                  aria-expanded={openMenu === m.key}
                  aria-haspopup="true"
                  className={triggerClass(openMenu === m.key)}
                >
                  {m.label}
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform duration-200",
                      openMenu === m.key && "rotate-180"
                    )}
                  />
                </button>
              ))}

              <Link
                href="/download"
                className={cn(triggerClass(pathname === "/download"))}
              >
                Download
              </Link>

              <Link
                href="/philosophy"
                className={cn(triggerClass(pathname === "/philosophy"))}
              >
                Why zcrypt
              </Link>

              <Link
                href="/about"
                className={cn(triggerClass(pathname === "/about"))}
              >
                About
              </Link>
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-0.5">
              <button
                onClick={toggleTheme}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)]/60 hover:text-[var(--color-text)]"
                aria-label="Toggle theme"
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
              </button>

              <Link
                href="/login"
                className="hidden rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] md:flex"
              >
                Log in
              </Link>

              <Link
                href="/register"
                className="hidden items-center gap-1.5 rounded-lg bg-[var(--color-text)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-bg)] transition-opacity hover:opacity-90 md:flex"
              >
                Get started
                <ArrowRight className="h-3 w-3" />
              </Link>

              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)]/60 hover:text-[var(--color-text)] md:hidden"
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </motion.div>

          {/* Mega-menu panel */}
          <AnimatePresence>
            {openMenu && (
              <motion.div
                // Panel spans the full navbar width via inset-x-0 (no horizontal
                // translate), so motion's y/scale transform can't fight the
                // centering the way -translate-x-1/2 did.
                initial={{ opacity: 0, y: 8, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.985 }}
                transition={{ duration: 0.75, ease: [0.26, 1, 0.3, 1] }}
                style={{ transformOrigin: "top center" }}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
                role="menu"
                aria-label={openMenu === "product" ? "Product" : "Documentation"}
                className="pointer-events-auto absolute inset-x-0 top-full z-50 mt-2 hidden min-h-[55dvh] flex flex-col rounded-3xl corner-squircle nav-glass-panel border border-[rgba(0,213,228,0.18)] shadow-2xl shadow-black/20 md:block"
              >
                {openMenu === "product" ? (
                  <ProductMega onItem={() => setOpenMenu(null)} />
                ) : (
                  <DocsMega onItem={() => setOpenMenu(null)} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden dark:bg-black/40"
              onClick={() => setMobileOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed left-4 right-4 top-16 z-50 max-h-[80dvh] overflow-y-auto rounded-2xl corner-squircle nav-glass-panel border border-[rgba(0,213,228,0.18)] md:hidden"
            >
              <div className="space-y-1 p-3">
                <Link
                  href="/"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                >
                  Home
                </Link>

                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Features
                </p>
                <ul className="list-none">
                  {productFeatures.map((i) => (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                      >
                        {i.icon && <i.icon className="h-4 w-4 text-cyan-500" />}
                        {i.title}
                      </Link>
                    </li>
                  ))}
                </ul>

                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Tools
                </p>
                <ul className="list-none">
                  {productTools.map((i) => (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                      >
                        {i.icon && <i.icon className="h-4 w-4 text-cyan-500" />}
                        {i.title}
                      </Link>
                    </li>
                  ))}
                </ul>

                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Compare
                </p>
                <ul className="list-none">
                  {productCompare.map((i) => (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                      >
                        {i.title}
                      </Link>
                    </li>
                  ))}
                </ul>

                <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Docs
                </p>
                <ul className="list-none">
                  {docsStart.map((i) => (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                      >
                        {i.icon && <i.icon className="h-4 w-4 text-cyan-500" />}
                        {i.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/docs"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-cyan-600 dark:text-cyan-400"
                >
                  Open the docs
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>

                <Link
                  href="/download"
                  onClick={() => setMobileOpen(false)}
                  className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                >
                  <Download className="h-4 w-4 text-cyan-500" />
                  Download
                </Link>

                <Link
                  href="/philosophy"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                >
                  Why zcrypt
                </Link>

                <Link
                  href="/about"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
                >
                  About
                </Link>
              </div>

              <div className="mt-1 border-t border-[var(--color-border)] p-3 pt-3">
                <div className="flex gap-2">
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="flex-1 rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-center text-sm font-medium transition-colors hover:bg-[var(--color-surface-1)]"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileOpen(false)}
                    className="flex-1 rounded-xl bg-[var(--color-text)] px-4 py-2.5 text-center text-sm font-semibold text-[var(--color-bg)] transition-opacity hover:opacity-90"
                  >
                    Sign up
                  </Link>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
