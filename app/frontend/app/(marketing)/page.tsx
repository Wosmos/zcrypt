import Link from "next/link";
import type { Metadata } from "next";
import {
  Lock,
  Zap,
  GitBranch,
  Eye,
  Scissors,
  HeartHandshake,
  ArrowRight,
  Quote,
  HelpCircle,
  Terminal,
  Smartphone,
  Share2,
  Image,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Client animation islands
import {
  HeroSection,
  MagneticButton,
} from "@/components/marketing/landing/hero-section";
import { ScrollReveal } from "@/components/marketing/landing/scroll-reveal";
import { AnimatedBorderCard } from "@/components/marketing/landing/animated-border-card";
import { Marquee } from "@/components/marketing/landing/marquee";
import {
  AnimatedTimelineLine,
  TimelineStep,
} from "@/components/marketing/landing/timeline";
import { FAQItem } from "@/components/marketing/landing/faq-item";
import { AnimatedCounter } from "@/components/marketing/landing/animated-counter";
import { HoverReveal } from "@/components/marketing/landing/hover-reveal";
import { MacOSShowcase } from "@/components/marketing/macos-showcase";
import { BentoGrid } from "@/components/marketing/landing/bento-grid";
import { PricingSection } from "@/components/marketing/landing/product-prising";


export const metadata: Metadata = {
  title: "zpush — Zero-Knowledge Encrypted Cloud Storage",
  description:
    "Free, open-source encrypted cloud storage with AES-256-GCM encryption. Your files, your keys, your privacy.",
};

// ─── Static Data (SSR'd) ────────────────────────────────────

const features = [
  {
    icon: Lock,
    title: "AES-256-GCM Encryption",
    desc: "Industry-standard symmetric encryption protects every file before it leaves your device.",
    accent: "emerald",
    large: true,
  },
  {
    icon: Eye,
    title: "Zero-Knowledge Architecture",
    desc: "Your encryption keys never leave your device. We cannot access your data — by design.",
    accent: "violet",
    large: true,
  },
  {
    icon: Zap,
    title: "Zstd Compression",
    desc: "High-performance compression reduces file size before encryption, saving storage.",
    accent: "amber",
    large: false,
  },
  {
    icon: GitBranch,
    title: "Multi-Platform Storage",
    desc: "Store across GitHub, GitLab, and Hugging Face. Your data stays portable and redundant.",
    accent: "emerald",
    large: false,
  },
  {
    icon: Scissors,
    title: "Automatic Chunking",
    desc: "Large files are automatically split into encrypted chunks. No size limits.",
    accent: "rose",
    large: false,
  },
  {
    icon: HeartHandshake,
    title: "Generous Free Tier",
    desc: "10 GB free with zero-knowledge encryption. No credit card required to start.",
    accent: "cyan",
    large: false,
  },
];

const accentColors: Record<string, string> = {
  emerald:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-500 dark:text-amber-400 ring-amber-500/20",
  violet:
    "bg-violet-500/10 text-violet-500 dark:text-violet-400 ring-violet-500/20",
  rose: "bg-rose-500/10 text-rose-500 dark:text-rose-400 ring-rose-500/20",
  cyan: "bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 ring-cyan-500/20",
};

const steps = [
  {
    num: "01",
    title: "Drop a file",
    desc: "Drag and drop any file into your vault.",
  },
  {
    num: "02",
    title: "We compress it",
    desc: "Zstd squeezes every wasted byte out.",
  },
  {
    num: "03",
    title: "We encrypt it",
    desc: "AES-256-GCM. Your passphrase, your keys.",
  },
  {
    num: "04",
    title: "We chunk it",
    desc: "Split into pieces, disguised as build artifacts.",
  },
  {
    num: "05",
    title: "Stored securely",
    desc: "Your encrypted data is distributed across Git-based storage platforms.",
  },
];

const testimonials = [
  {
    quote:
      "Switched from Dropbox. Same 2TB, half the price, and my files are actually encrypted. No-brainer.",
    author: "Freelance Designer",
  },
  {
    quote:
      "The zero-knowledge architecture convinced our security team immediately. Open source sealed the deal.",
    author: "Senior Cloud Architect",
  },
  {
    quote:
      "I can point auditors to the source code. Client-side encryption, no server-side keys. Compliance loves it.",
    author: "Platform Engineer",
  },
];

const faqs = [
  {
    q: "How much storage do I get for free?",
    a: "The free tier includes 10 GB of zero-knowledge encrypted storage with up to 2 concurrent uploads. No credit card required. Upgrade to Plus ($4/mo) for 200 GB or Pro ($9/mo) for 2 TB.",
  },
  {
    q: "How secure is the encryption?",
    a: "We use AES-256-GCM, the cryptographic standard used by financial institutions globally. Your encryption keys are derived locally on your device and are never transmitted. This zero-knowledge architecture ensures that even we cannot access your files.",
  },
  {
    q: "What makes zpush cheaper than Dropbox or Google Drive?",
    a: "Our architecture is fundamentally different. We use Git-based distributed storage instead of expensive centralized infrastructure. This lets us offer 2 TB for $9/mo (vs $12 at Dropbox) while providing stronger encryption that competitors don't offer at any price.",
  },
  {
    q: "What is BYOB (Bring Your Own Backend)?",
    a: "Pro and Team users can connect their own GitHub, GitLab, or Hugging Face repositories as storage backends. Your data stays on infrastructure you fully control, with zpush handling the encryption and chunking.",
  },
  {
    q: "Can I access my files across multiple devices?",
    a: "Yes. Log into zpush from any modern browser, enter your passphrase, and access your encrypted files. Everything is decrypted locally in your browser.",
  },
  {
    q: "What happens if I forget my passphrase?",
    a: "Because zpush is strictly zero-knowledge, your passphrase is never stored on our servers. If you lose it, your encrypted files cannot be recovered by anyone. We strongly recommend using a password manager.",
  },
];

// ─── Page (Server Component) ─────────────────────────────────

export default function LandingPage() {
  const largeFeatures = features.filter((f) => f.large);
  const smallFeatures = features.filter((f) => !f.large);

  return (
    <>
      {/* ═══ HERO (Client Island) ═══ */}
      <HeroSection />

      {/* ═══ CLOUD FEATURES TICKER ═══ */}
      <section className=" border-y border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <Marquee
          items={[
            "2 TB for $9/mo",
            "Zero-knowledge encryption",
            "Open source and auditable",
            "AES-256-GCM standard",
            "Cheaper than Dropbox",
            "10 GB free tier",
            "No egress fees",
            "Client-side encryption",
            "Bring your own backend",
            "Multi-platform storage",
            "Zstd compression",
            "GDPR compliant",
          ]}
        />
      </section>

      {/* ═══ FEATURES — BENTO GRID ═══ */}
      <BentoGrid />

      {/* ═══ APP SHOWCASE ═══ */}
      <section className="py-24 px-4 bg-[var(--color-surface)] overflow-hidden">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal className="text-center mb-16">
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3">
              Experience
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              See it in action
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-3 max-w-lg mx-auto">
              A native-feeling experience. Drag, drop, encrypted. It&apos;s that
              simple.
            </p>
          </ScrollReveal>

          <MacOSShowcase />
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="py-24 px-4 bg-[var(--color-surface)]">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal className="text-center mb-16">
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Five steps to freedom
            </h2>
          </ScrollReveal>

          <div className="relative">
            <AnimatedTimelineLine />
            <div className="space-y-0">
              {steps.map((step, i) => (
                <TimelineStep key={step.num} step={step} index={i} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
     <PricingSection />

      {/* ═══ TESTIMONIALS ═══ */}
      <section className="py-24 px-4 bg-[var(--color-surface)]">
        <div className="mx-auto max-w-5xl">
          <ScrollReveal className="text-center mb-16">
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3">
              Testimonials
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Trusted by developers and teams
            </h2>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {testimonials.map((t, i) => (
              <ScrollReveal key={i} delay={i * 0.1}>
                <div className="card p-6 h-full flex flex-col">
                  <Quote className="h-5 w-5 text-emerald-500/30 mb-3 flex-shrink-0" />
                  <p className="text-sm text-[var(--color-text)] leading-relaxed flex-1">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-4 font-medium">
                    &mdash; {t.author}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section className="py-24 px-4">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text-secondary)] mb-4">
              <HelpCircle className="h-3.5 w-3.5 text-emerald-500" />
              FAQ
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Got Questions? We&apos;ve Got Answers
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-3 max-w-lg mx-auto">
              Everything you need to know before trusting us with your files.
            </p>
          </ScrollReveal>

          <ScrollReveal>
            <div className="card p-1 sm:p-2">
              <div className="px-4 sm:px-6">
                {faqs.map((faq, i) => (
                  <FAQItem key={i} question={faq.q} answer={faq.a} />
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ COMING SOON ═══ */}
      <section className="py-24 px-4 bg-[var(--color-surface)]">
        <div className="mx-auto max-w-5xl">
          <ScrollReveal className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-4">
              <Rocket className="h-3.5 w-3.5" />
              Roadmap
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              We&apos;re just getting started.
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-3 max-w-lg mx-auto">
              Big things are coming to zpush. Here&apos;s a taste of what&apos;s next.
            </p>
          </ScrollReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                icon: Terminal,
                title: "CLI Tool",
                desc: "Upload, download, and manage your vault from the command line. Script your backups.",
                badge: "Q2 2026",
              },
              {
                icon: Smartphone,
                title: "Mobile App",
                desc: "iOS and Android apps with offline access and camera backup. Your vault in your pocket.",
                badge: "Q3 2026",
              },
              {
                icon: Share2,
                title: "Encrypted Sharing",
                desc: "Share files with end-to-end encryption. Time-limited links. Password protection.",
                badge: "Q2 2026",
              },
              {
                icon: Image,
                title: "Photo Gallery",
                desc: "Browse your encrypted photos with a beautiful gallery view. Private photo backup.",
                badge: "Q3 2026",
              },
            ].map((item, i) => (
              <ScrollReveal key={i} delay={i * 0.1}>
                <div className="card p-5 h-full flex gap-4 items-start group">
                  <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex-shrink-0 group-hover:scale-110 transition-transform">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-bold">{item.title}</h3>
                      <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        {item.badge}
                      </span>
                    </div>
                    <p className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-32 px-4 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/5 to-transparent" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/8 dark:bg-emerald-500/3 rounded-full blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-2xl text-center">
          <ScrollReveal>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              Your Files Deserve Better
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-4 text-lg">
              10 GB free. Zero-knowledge encryption. No credit card required.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="mt-10 relative inline-block">
              <MagneticButton
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-10 py-4 text-base font-semibold text-slate-900 hover:bg-emerald-400 transition-colors shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50"
              >
                Start with 10 GB free <ArrowRight className="h-4 w-4" />
              </MagneticButton>

              {/* Easter egg on long hover */}
              <HoverReveal />
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
