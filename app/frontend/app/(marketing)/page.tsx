import Link from "next/link";
import type { Metadata } from "next";
import {
  Lock,
  ArrowRight,
  HelpCircle,
  Terminal,
  Smartphone,
  Share2,
  Image,
  Rocket,
  Github,
  HardDrive,
} from "@/lib/icons";
import {
  faqs,
  roadmapItems,
  marqueeItems,
} from "@/lib/data";

// Client animation islands
import { HeroSection } from "@/components/marketing/landing/hero-section";
import {
  AnimatedTimelineLine,
  TimelineStep,
} from "@/components/marketing/landing/timeline";
import { ScrollReveal } from "@/components/marketing/landing/scroll-reveal";
import { Marquee } from "@/components/marketing/landing/marquee";
import { FAQItem } from "@/components/marketing/landing/faq-item";
import { Underlined } from "@/components/marketing/landing/pencil-underline";
import { HoverReveal } from "@/components/marketing/landing/hover-reveal";
import { MacOSShowcase } from "@/components/marketing/macos-showcase";
import { BentoGrid } from "@/components/marketing/landing/bento-grid";
import { EncryptionBoundary } from "@/components/marketing/landing/encryption-boundary";
import { BringYourOwnStorage } from "@/components/marketing/landing/bring-your-own-storage";
import { BuiltToTrust } from "@/components/marketing/landing/built-to-trust";
import { BuiltBy } from "@/components/marketing/landing/built-by";
import {
  FAQJsonLd,
  SoftwareApplicationJsonLd,
} from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "zcrypt — The Encrypted Cloud Drive You Actually Own",
  description:
    "zcrypt is a zero-knowledge encrypted cloud drive: real folders, instant in-browser previews, and per-folder passwords. Files are encrypted on your device with AES-256-GCM and stored inside your own GitHub, GitLab, Hugging Face, or Telegram account. Free, open source, no artificial limits.",
  alternates: {
    canonical: "https://zcrypt.cloud",
  },
  openGraph: {
    title: "zcrypt — The Encrypted Cloud Drive You Actually Own",
    description:
      "Real folders, instant previews, encrypted on your device and stored in accounts you already own. Zero-knowledge AES-256-GCM, open source, no artificial limits.",
    url: "https://zcrypt.cloud",
  },
};

// ─── Icon Maps (Server Component can reference client components) ───

const roadmapIconMap: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  Terminal,
  Smartphone,
  Share2,
  Image,
};

// ─── Plain-language "How it works" steps (homepage only) ─────
const howItWorksSteps = [
  {
    num: "01",
    title: "Connect your account",
    desc: "Link a storage account you already have — GitHub, GitLab, Hugging Face, or Telegram. That account becomes your private vault.",
    icon: Github,
  },
  {
    num: "02",
    title: "Drop a file",
    desc: "Your file is encrypted on your device before it ever leaves it. The key comes from your passphrase and never leaves your device.",
    icon: Lock,
  },
  {
    num: "03",
    title: "Stored in your own cloud",
    desc: "Your file is saved as encrypted pieces inside your own account. Only you, with your passphrase, can unlock it — from anywhere.",
    icon: HardDrive,
  },
];

// ─── Short objections / reassurance ──────────────────────────
const objections = [
  {
    q: "Do I need a GitHub account?",
    a: "Yes — and that's the point. Your files live in storage you own, so there are no artificial limits and nothing is locked to us.",
  },
  {
    q: "Is this allowed by the platforms?",
    a: "Only encrypted, private data is ever uploaded.",
  },
  {
    q: "Are my files always retrievable?",
    a: "Your file is stored as encrypted pieces and reassembled when you download.",
  },
];

// ─── Feature links (internal linking + discovery) ────────────
const homeFeatures = [
  {
    href: "/features/encrypted-drive",
    title: "A real file & folder system",
    desc: "Nest folders, drag to organize, search and sort — a proper drive.",
  },
  {
    href: "/features/file-viewers",
    title: "Preview without downloading",
    desc: "Open images, video, PDFs, docs, and code — decrypted in your browser.",
  },
  {
    href: "/features/folders",
    title: "Password-protected folders",
    desc: "Give any folder its own password, separate from your vault.",
  },
  {
    href: "/features/encryption",
    title: "Zero-knowledge encryption",
    desc: "AES-256-GCM on your device. We only ever see ciphertext.",
  },
  {
    href: "/features/bring-your-own-storage",
    title: "Bring your own storage",
    desc: "GitHub, GitLab, Hugging Face, or Telegram. No lock-in.",
  },
  {
    href: "/features/transfers",
    title: "A real transfer manager",
    desc: "Pause, resume, retry, and track every upload and download.",
  },
];

// ─── Page (Server Component) ─────────────────────────────────

export default function LandingPage() {
  return (
    <>
      <SoftwareApplicationJsonLd />
      <FAQJsonLd faqs={faqs} />

      {/* ═══ HERO (Client Island) ═══ */}
      <HeroSection />

      {/* ═══ FACTS TICKER ═══ */}
      <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <Marquee items={marqueeItems} />
      </section>

      {/* ═══ APP SHOWCASE ═══ */}
      
      <section className="py-24 px-4 bg-[var(--color-surface)] overflow-hidden">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal className="text-center mb-16">
            <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-3">
              Experience
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Your whole drive, <em className="italic">end-to-end encrypted</em>
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-3 max-w-lg mx-auto">
              Folders, instant previews, drag-and-drop — a real file explorer
              where every file is encrypted on your device.
            </p>
          </ScrollReveal>

          <MacOSShowcase />
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how-it-works" className="py-28 px-4 scroll-mt-20">
        <div className="mx-auto max-w-5xl">
          <ScrollReveal className="text-center mb-16">
            <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-3">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Three steps. <em className="italic"> <Underlined variant="ink" delay={0.5}>Nothing</Underlined>  </em> we can read.
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-4 max-w-xl mx-auto leading-relaxed">
              No new storage to buy, no servers to trust. Your files are encrypted
              before they leave your device and stored in an account you already own.
            </p>
          </ScrollReveal>

          <div className="relative mx-auto max-w-2xl">
            <AnimatedTimelineLine />
            <div className="relative">
              {howItWorksSteps.map((step, i) => (
                <TimelineStep key={step.num} step={step} index={i} />
              ))}
            </div>
          </div>

          {/* Under the hood — for the curious */}
          <ScrollReveal delay={0.2} className="mt-10 text-center">
            <p className="text-xs text-[var(--color-text-muted)] max-w-2xl mx-auto leading-relaxed">
              Under the hood: files are compressed with zstd, encrypted with
              AES-256-GCM using a key derived from your passphrase, split into
              chunks, and uploaded to your connected platform — all client-side
              and zero-knowledge.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ ENCRYPTION BOUNDARY (zero-knowledge proof) ═══ */}
      <EncryptionBoundary />

      {/* ═══ BRING YOUR OWN STORAGE ═══ */}
      <BringYourOwnStorage />

      {/* ═══ FEATURES — BENTO GRID ═══ */}
      <BentoGrid />

   

      {/* ═══ EXPLORE THE DRIVE — feature links ═══ */}
      <section className="py-24 px-4 bg-[var(--color-surface)]">
        <div className="mx-auto max-w-5xl">
          <ScrollReveal className="text-center mb-12">
            <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-3">
              Explore the drive
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Everything it does
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-3 max-w-lg mx-auto">
              A real file manager with a zero-knowledge core. Dig into any part of it.
            </p>
          </ScrollReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {homeFeatures.map((f) => (
              <Link
                key={f.href}
                href={f.href}
                className="card group p-5 transition-colors hover:border-cyan-500/40"
              >
                <h3 className="text-sm font-bold flex items-center gap-2">
                  {f.title}
                  <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h3>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {f.desc}
                </p>
              </Link>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link
              href="/features"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-600 dark:text-cyan-400 hover:gap-2.5 transition-all"
            >
              See all features
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ WHY ZCRYPT — TRUST STACK ═══ */}
      <BuiltToTrust />

      {/* ═══ FAQ + OBJECTIONS ═══ */}
      <section className="py-24 px-4">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text-secondary)] mb-4">
              <HelpCircle className="h-3.5 w-3.5 text-cyan-500" />
              FAQ
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Questions? Answers.
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-3 max-w-lg mx-auto">
              Everything you need to know before trusting us with your files.
            </p>
          </ScrollReveal>

          {/* Quick objections row */}
          <ScrollReveal className="mb-6">
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 list-none">
              {objections.map((o) => (
                <li
                  key={o.q}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
                >
                  <h3 className="text-sm font-bold tracking-tight mb-1.5">
                    {o.q}
                  </h3>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                    {o.a}
                  </p>
                </li>
              ))}
            </ul>
          </ScrollReveal>

          <ScrollReveal>
            <div className="flex flex-col gap-3">
              {faqs.map((faq, i) => (
                <FAQItem key={i} question={faq.q} answer={faq.a} />
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ ROADMAP ═══ */}
      <section className="py-24 px-4 bg-[var(--color-surface)]">
        <div className="mx-auto max-w-5xl">
          <ScrollReveal className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/5 text-xs font-medium text-cyan-600 dark:text-cyan-400 mb-4">
              <Rocket className="h-3.5 w-3.5" />
              Roadmap
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              We&apos;re just getting started.
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-3 max-w-lg mx-auto">
              Here&apos;s what we&apos;re building next.
            </p>
          </ScrollReveal>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 list-none">
            {roadmapItems.map((item, i) => {
              const Icon = roadmapIconMap[item.icon];
              return (
                <li key={i}>
                  <ScrollReveal delay={i * 0.1}>
                    <div className="card p-5 h-full flex gap-4 items-start group">
                      <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-cyan-500/10 text-cyan-500 flex-shrink-0 group-hover:scale-110 transition-transform">
                        {Icon && <Icon className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-bold">{item.title}</h3>
                          <span className="text-[10px] font-bold text-cyan-500 bg-cyan-500/10 px-2 py-0.5 rounded-full">
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  </ScrollReveal>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ═══ TERMINAL APP (de-emphasized, lower on page) ═══ */}
      {/* <section className="py-24 px-4">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text-secondary)] mb-4">
              <Terminal className="h-3.5 w-3.5 text-cyan-500" />
              For developers
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Prefer the command line?
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-3 max-w-lg mx-auto leading-relaxed">
              There&apos;s a full terminal app with the same zero-knowledge
              encryption — a single binary, no dependencies. Optional, and never
              required to use zcrypt.
            </p>
            <div className="mt-7">
              <Link
                href="/tui"
                className="group inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 text-sm font-semibold text-[var(--color-text)] hover:border-cyan-500/40 transition-colors"
              >
                <Terminal className="h-4 w-4 text-cyan-500" />
                Explore the terminal app
                <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section> */}

      {/* ═══ BUILT BY (maker signature) ═══ */}
      <BuiltBy />

      {/* ═══ CTA ═══ */}
      <section className="py-32 px-4 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/8 dark:bg-cyan-500/3 rounded-full blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-2xl text-center">
          <ScrollReveal>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-400">
              Get started today
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              The drive you{" "}
              <Underlined variant="highlight">
                <em className="italic">actually own.</em>
              </Underlined>
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-4 text-lg">
              Connect your own account. Encrypted on your device. No artificial
              limits, no vendor lock-in.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="mt-10 relative inline-flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 text-base font-semibold text-slate-900 bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50"
              >
                Create your vault <ArrowRight className="h-4 w-4" />
              </Link>
              {/* <MagneticButton
                href="/docs"
                className="inline-flex items-center justify-center rounded-full px-8 py-3.5 text-base font-semibold text-[var(--color-text)] border border-[var(--color-border)] bg-black/[0.02] dark:bg-white/[0.02] transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/5"
              >
                Read the docs
              </MagneticButton> */}

              {/* Easter egg on long hover */}
              <HoverReveal />
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
