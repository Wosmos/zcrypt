"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import {
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
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LiquidGlassFilter } from "@/components/marketing/liquid-glass-filter";
import { useAuthStore } from "@/store/auth";
import "@/components/marketing/v2/chrome.css";

type IconType = React.ComponentType<{ className?: string; size?: number }>;
type MenuItem = { href: string; title: string; desc?: string; icon?: IconType };

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";

// ─── Mega-menu content ───────────────────────────────────────
const productFeatures: MenuItem[] = [
  {
    href: "/features/encrypted-drive",
    icon: HardDrive,
    title: "Encrypted drive",
    desc: "Folders, search & previews, a real explorer.",
  },
  {
    href: "/features/folders",
    icon: FolderOpen,
    title: "Encrypted folders",
    desc: "Nestable folders with their own passwords.",
  },
  {
    href: "/features/file-viewers",
    icon: Eye,
    title: "File viewers",
    desc: "Preview files without downloading them.",
  },
  {
    href: "/features/sharing",
    icon: Share2,
    title: "Sharing",
    desc: "Links with passwords, expiry & limits.",
  },
  {
    href: "/features/encryption",
    icon: Lock,
    title: "Zero-knowledge encryption",
    desc: "AES-256-GCM, on your device.",
  },
  {
    href: "/features/bring-your-own-storage",
    icon: RefreshCcw,
    title: "Bring your own storage",
    desc: "GitHub, GitLab, Hugging Face, Telegram.",
  },
];

const productTools: MenuItem[] = [
  { href: "/send", icon: Send, title: "Send a file", desc: "Encrypted one-off sharing." },
  {
    href: "/pad",
    icon: FileText,
    title: "Encrypted notepad",
    desc: "Private, zero-knowledge notes.",
  },
  {
    href: "/transfer",
    icon: RefreshCcw,
    title: "Device transfer",
    desc: "Move files between devices.",
  },
];

const productCompare: MenuItem[] = [
  { href: "/vs/proton-drive", title: "vs Proton Drive" },
  { href: "/vs/dropbox", title: "vs Dropbox" },
  { href: "/vs/google-drive", title: "vs Google Drive" },
];

const docsStart: MenuItem[] = [
  {
    href: "/docs/getting-started",
    icon: Rocket,
    title: "Quickstart",
    desc: "Set up and upload your first file.",
  },
  {
    href: "/docs/concepts",
    icon: Key,
    title: "Core concepts",
    desc: "Vault, passphrase, folders, chunks.",
  },
  {
    href: "/docs/connect-storage",
    icon: HardDrive,
    title: "Connect storage",
    desc: "Link a backend you already own.",
  },
];

const docsPopular: MenuItem[] = [
  {
    href: "/docs/folders",
    icon: FolderOpen,
    title: "Folders & files",
    desc: "Organize your drive.",
  },
  {
    href: "/docs/security",
    icon: Shield,
    title: "Security model",
    desc: "How the encryption works.",
  },
  {
    href: "/docs/self-hosting",
    icon: Server,
    title: "Self-hosting",
    desc: "Run zcrypt with Docker.",
  },
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
      className={cn(
        "group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-[var(--color-surface-1)]",
        FOCUS_RING,
      )}
    >
      {Icon && (
        <span className="mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-cyan-500/10 text-cyan-500 transition-colors group-hover:bg-cyan-500/15">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-[var(--color-text)]">
          {item.title}
        </span>
        {item.desc && (
          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--color-text-muted)]">
            {item.desc}
          </span>
        )}
      </span>
    </Link>
  );
}

/** One row in a mobile-menu section: link + optional leading icon. */
function MobileNavLink({ item, onClick }: { item: MenuItem; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]",
        FOCUS_RING,
      )}
    >
      {Icon && <Icon className="h-4 w-4 text-cyan-500" />}
      {item.title}
    </Link>
  );
}

/** A titled group of links in the mobile menu (Features / Tools / Compare / Docs). */
function MobileNavSection({
  title,
  items,
  onClick,
}: {
  title: string;
  items: MenuItem[];
  onClick: () => void;
}) {
  return (
    <>
      <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {title}
      </p>
      <ul className="list-none">
        {items.map((i) => (
          <li key={i.href}>
            <MobileNavLink item={i} onClick={onClick} />
          </li>
        ))}
      </ul>
    </>
  );
}

function MegaHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
      {children}
    </p>
  );
}

function MegaCtaLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold text-cyan-700 transition-[gap,background-color] hover:gap-2.5 hover:bg-cyan-500/8 dark:text-cyan-400",
        FOCUS_RING,
      )}
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
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-cyan-500/20 bg-[#060b16] p-6",
        FOCUS_RING,
      )}
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
      {/* Features, widest column */}
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
        <MegaCtaLink href="/features" onClick={onItem}>
          All features
        </MegaCtaLink>
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
                  className={cn(
                    "block rounded-xl px-3 py-2 text-[12px] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]",
                    FOCUS_RING,
                  )}
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
          desc="Real folders, instant previews, and zero-knowledge encryption, on every platform."
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
        <MegaCtaLink href="/docs" onClick={onItem}>
          Open the docs
        </MegaCtaLink>
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
          desc="REST endpoints, authentication, and the SSE event stream, fully documented."
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

const PANEL_IN = [0.05, 0.7, 0.1, 1] as const;
const PANEL_OUT = [0.3, 0, 0.8, 0.15] as const;

export function MarketingNav() {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<MegaKey | null>(null);
  const hasSession = useAuthStore((s) => Boolean(s.user || s.accessToken));
  const [hydrated, setHydrated] = useState(false);
  const signedIn = hydrated && hasSession;
  const headerRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const glassRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setHydrated(true), []);
  const sheetRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const triggerRefs = useRef<Partial<Record<MegaKey, HTMLButtonElement | null>>>({});
  const openRef = useRef<MegaKey | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    openRef.current = openMenu;
  }, [openMenu]);

  const openMega = (k: MegaKey) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (openTimer.current) clearTimeout(openTimer.current);
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

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let last: boolean | null = null;
    const onScroll = () => {
      const next = window.scrollY > 24;
      if (next === last) return;
      last = next;
      header.dataset.scrolled = String(next);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header || pathname === null) return;
    const busy = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.target.getAttribute("data-nav-tone") === "busy") {
            busy.add(e.target);
          } else {
            busy.delete(e.target);
          }
        }
        header.dataset.tone = busy.size > 0 ? "busy" : "calm";
      },
      { rootMargin: "-8px 0px -92% 0px" },
    );
    const raf = requestAnimationFrame(() => {
      for (const n of document.querySelectorAll("[data-nav-tone]")) io.observe(n);
    });
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      header.dataset.tone = "calm";
    };
  }, [pathname]);

  useEffect(() => {
    const pill = pillRef.current;
    const glass = glassRef.current;
    if (!pill || !glass) return;
    const mq = matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    if (!mq.matches) return;
    let raf = 0;
    let x = 0;
    const apply = () => {
      raf = 0;
      const r = pill.getBoundingClientRect();
      const angle = Math.min(180, Math.max(90, 135 + (x - (r.left + r.width / 2)) * 0.12));
      glass.style.setProperty("--lg-angle", `${angle.toFixed(1)}deg`);
    };
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      glass.style.setProperty("--lg-angle", "135deg");
    };
    pill.addEventListener("pointermove", onMove);
    pill.addEventListener("pointerleave", onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      pill.removeEventListener("pointermove", onMove);
      pill.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // Close on route change.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const current = openRef.current;
      if (!current) return;
      const panel = panelRef.current;
      const active = document.activeElement;
      if (active && (panel?.contains(active) || active === triggerRefs.current[current])) {
        triggerRefs.current[current]?.focus();
      }
      setOpenMenu(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMobileOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const closeMobile = () => setMobileOpen(false);

  const triggerClass = (active: boolean) =>
    cn(
      "flex items-center gap-1 px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-[color,background-color] duration-200",
      FOCUS_RING,
      active
        ? "text-[var(--color-text)] bg-[var(--color-surface-1)]"
        : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-1)]/60",
    );

  const mobileRow =
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]";

  return (
    <>
      <div className="h-4" />

      <header
        ref={headerRef}
        data-scrolled="false"
        data-tone="calm"
        data-menu={openMenu ?? (mobileOpen ? "mobile" : "")}
        className="fixed top-0 left-0 right-0 z-50 pointer-events-none pt-3 px-4 sm:px-6 lg:px-8"
      >
        <LiquidGlassFilter targetRef={pillRef} />
        <div className="relative mx-auto max-w-6xl">
          <motion.div
            ref={pillRef}
            initial={{ y: -16 }}
            animate={{ y: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
            className="lg-pill pointer-events-auto relative rounded-3xl corner-squircle px-3"
          >
            <span ref={glassRef} aria-hidden="true" className="lg-glass" />
            <div className="relative z-[1] flex items-center justify-between">
              <Link
                href="/"
                aria-label="zcrypt home"
                className={cn("flex items-center rounded-xl", FOCUS_RING)}
              >
                <Logo size="lg" />
              </Link>

              <nav
                aria-label="Main"
                className="hidden items-center gap-0.5 md:flex"
                onMouseLeave={scheduleClose}
              >
                <Link
                  href="/"
                  aria-current={pathname === "/" ? "page" : undefined}
                  className={triggerClass(pathname === "/")}
                >
                  Home
                </Link>

                {MEGA_MENUS.map((m) => (
                  <button
                    key={m.key}
                    ref={(node) => {
                      triggerRefs.current[m.key] = node;
                    }}
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
                        "h-3 w-3 transition-transform duration-200 motion-reduce:transition-none",
                        openMenu === m.key && "rotate-180",
                      )}
                    />
                  </button>
                ))}

                <Link
                  href="/download"
                  aria-current={pathname === "/download" ? "page" : undefined}
                  className={triggerClass(pathname === "/download")}
                >
                  Download
                </Link>

                <Link
                  href="/philosophy"
                  aria-current={pathname === "/philosophy" ? "page" : undefined}
                  className={triggerClass(pathname === "/philosophy")}
                >
                  Why zcrypt
                </Link>

                <Link
                  href="/about"
                  aria-current={pathname === "/about" ? "page" : undefined}
                  className={triggerClass(pathname === "/about")}
                >
                  About
                </Link>
              </nav>

              <div className="flex items-center gap-0.5">
                <ThemeToggle className={cn("max-md:h-11 max-md:w-11", FOCUS_RING)} />

                {signedIn ? null : (
                  <Link
                    href="/login"
                    className={cn(
                      "hidden rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text)] md:flex",
                      FOCUS_RING,
                    )}
                  >
                    Log in
                  </Link>
                )}

                <Link
                  href={signedIn ? "/dashboard" : "/register"}
                  className={cn(
                    "group hidden items-center gap-1.5 rounded-lg bg-[var(--color-text)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-bg)] shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(0_0_0/0.12)] transition-opacity hover:opacity-90 md:flex",
                    FOCUS_RING,
                  )}
                >
                  {signedIn ? "Open app" : "Get started"}
                  <ArrowRight className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </Link>

                <button
                  ref={toggleRef}
                  type="button"
                  onClick={() => setMobileOpen((o) => !o)}
                  aria-expanded={mobileOpen}
                  aria-controls="mobile-menu"
                  aria-label={mobileOpen ? "Close menu" : "Open menu"}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)]/60 hover:text-[var(--color-text)] md:hidden",
                    FOCUS_RING,
                  )}
                >
                  {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </motion.div>

          <AnimatePresence>
            {openMenu && (
              <motion.div
                ref={panelRef}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: { duration: reduce ? 0.16 : 0.32, ease: PANEL_IN },
                }}
                exit={{
                  opacity: 0,
                  y: reduce ? 0 : 6,
                  scale: reduce ? 1 : 0.99,
                  transition: { duration: 0.18, ease: PANEL_OUT },
                }}
                style={{ transformOrigin: "top center" }}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
                role="menu"
                aria-label={openMenu === "product" ? "Product" : "Documentation"}
                className="lg-panel pointer-events-auto absolute inset-x-0 top-full z-50 mt-2 hidden min-h-[55dvh] flex-col rounded-3xl corner-squircle md:flex"
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

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-slate-950/25 md:hidden dark:bg-black/50"
              onClick={closeMobile}
            />

            <motion.div
              ref={sheetRef}
              id="mobile-menu"
              tabIndex={-1}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { duration: reduce ? 0.16 : 0.3, ease: PANEL_IN },
              }}
              exit={{
                opacity: 0,
                y: reduce ? 0 : -6,
                scale: reduce ? 1 : 0.98,
                transition: { duration: 0.18, ease: PANEL_OUT },
              }}
              style={{ transformOrigin: "top center" }}
              className="lg-panel fixed left-4 right-4 top-20 z-50 flex outline-none max-h-[calc(100dvh-6.5rem)] flex-col overflow-hidden rounded-2xl corner-squircle md:hidden"
            >
              <nav
                aria-label="Mobile"
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              >
                <div className="space-y-1 p-3">
                  <Link href="/" onClick={closeMobile} className={cn(mobileRow, FOCUS_RING)}>
                    Home
                  </Link>

                  <MobileNavSection
                    title="Features"
                    items={productFeatures}
                    onClick={closeMobile}
                  />
                  <MobileNavSection title="Tools" items={productTools} onClick={closeMobile} />
                  <MobileNavSection title="Compare" items={productCompare} onClick={closeMobile} />
                  <MobileNavSection title="Docs" items={docsStart} onClick={closeMobile} />
                  <Link
                    href="/docs"
                    onClick={closeMobile}
                    className={cn(
                      "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-cyan-700 dark:text-cyan-400",
                      FOCUS_RING,
                    )}
                  >
                    Open the docs
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>

                  <Link
                    href="/download"
                    onClick={closeMobile}
                    className={cn(mobileRow, "mt-1", FOCUS_RING)}
                  >
                    <Download className="h-4 w-4 text-cyan-500" />
                    Download
                  </Link>

                  <Link
                    href="/philosophy"
                    onClick={closeMobile}
                    className={cn(mobileRow, FOCUS_RING)}
                  >
                    Why zcrypt
                  </Link>

                  <Link href="/about" onClick={closeMobile} className={cn(mobileRow, FOCUS_RING)}>
                    About
                  </Link>
                </div>
              </nav>

              <div className="border-t border-[var(--color-border)] p-3">
                <div className="flex gap-2">
                  {signedIn ? (
                    <Link
                      href="/dashboard"
                      onClick={closeMobile}
                      className={cn(
                        "flex h-11 flex-1 items-center justify-center rounded-xl bg-[var(--color-text)] px-4 text-sm font-semibold text-[var(--color-bg)] transition-opacity hover:opacity-90",
                        FOCUS_RING,
                      )}
                    >
                      Open app
                    </Link>
                  ) : null}
                  <Link
                    hidden={signedIn}
                    href="/login"
                    onClick={closeMobile}
                    className={cn(
                      "flex h-11 flex-1 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 text-sm font-medium transition-colors hover:bg-[var(--color-surface-1)]",
                      FOCUS_RING,
                    )}
                  >
                    Log in
                  </Link>
                  <Link
                    hidden={signedIn}
                    href="/register"
                    onClick={closeMobile}
                    className={cn(
                      "flex h-11 flex-1 items-center justify-center rounded-xl bg-[var(--color-text)] px-4 text-sm font-semibold text-[var(--color-bg)] transition-opacity hover:opacity-90",
                      FOCUS_RING,
                    )}
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
