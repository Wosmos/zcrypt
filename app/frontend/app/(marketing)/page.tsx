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
  Check,
  X,
  Quote,
  HelpCircle,
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
    desc: "Large files are automatically split into chunks that fit within platform limits.",
    accent: "rose",
    large: false,
  },
  {
    icon: HeartHandshake,
    title: "Free Forever",
    desc: "Open-source software. No credit card required. No premium tiers. Free forever.",
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
    title: "Cloud stores it free",
    desc: "Your encrypted data lives on free Git-based storage platforms.",
  },
];

const pricing = [
  {
    name: "Hyperscalers (S3, GCS)",
    price: "$20+",
    period: "/TB/mo",
    desc: "Enterprise cloud storage. Built for applications, not personal privacy.",
    features: [
      "Egress & request fees",
      "Data lock-in",
      "Complex billing structures",
      "Data is not zero-knowledge",
    ],
    highlight: false,
  },
  {
    name: "zpush",
    price: "$0",
    period: "forever",
    desc: "Absolute privacy. We leverage Git-based storage to provide secure, zero-knowledge personal cloud.",
    features: [
      "Unlimited potential storage",
      "AES-256-GCM encryption",
      "Zero-knowledge privacy",
      "Bring your own Git limits",
      "Open source architecture",
    ],
    highlight: true,
  },
  {
    name: "Consumer Cloud",
    price: "$10-15",
    period: "/mo for 2TB",
    desc: "Convenient syncing with hard data caps and server-side managed encryption.",
    features: [
      "Strict data caps",
      "Server-managed keys",
      "Vendor ecosystem lock-in",
      "Data indexed for search",
    ],
    highlight: false,
  },
];

const testimonials = [
  {
    quote:
      "I was spending over $800/month on cloud storage alone. Now my files are encrypted and stored for free.",
    author: "A Developer Who Switched",
  },
  {
    quote:
      "The zero-knowledge architecture convinced our security team immediately. It's exactly what we needed.",
    author: "Senior Cloud Architect",
  },
  {
    quote:
      "I explained zpush to our CISO. Client-side encryption, open-source, Git-backed. Approved on the spot.",
    author: "Platform Engineer",
  },
];

const faqs = [
  {
    q: "Is zpush completely free?",
    a: "Yes. zpush is open-source software that leverages existing Git LFS storage platforms (like GitHub, GitLab, and Hugging Face) as backend infrastructure. There are no subscriptions, hidden fees, or premium tiers for the core software.",
  },
  {
    q: "How secure is the encryption?",
    a: "We use AES-256-GCM, the cryptographic standard utilized by financial institutions globally. Your encryption keys are derived locally on your device and are never transmitted. This zero-knowledge architecture ensures that even we cannot access or read your files.",
  },
  {
    q: "What happens if a storage provider changes their limits?",
    a: "zpush is designed to support multiple platforms simultaneously. If one provider alters their terms, you can migrate your data to another platform seamlessly. Your data remains fully portable because it is encrypted and chunked in an open, standard format.",
  },
  {
    q: "Can I access my files across multiple devices?",
    a: "Absolutely. You can log into zpush from any modern browser, connect your Git platform accounts, and access your encrypted files. You will simply need your original passphrase to decrypt them locally.",
  },
  {
    q: "Are there file size limits?",
    a: "zpush intelligently chunks large files into manageable pieces locally before upload, allowing it to work seamlessly within typical Git LFS boundaries. This architecture means there is virtually no practical upper limit on the total size of the files you can store.",
  },
  {
    q: "Is my passphrase recoverable if I forget it?",
    a: "No. Because zpush is strictly zero-knowledge, your passphrase is never stored on our servers or sent over the network. If you lose your passphrase, your encrypted files cannot be recovered by us or anyone else. We strongly recommend using a password manager.",
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
            "Break free from vendor lock-in",
            "No complex pricing tiers",
            "Your keys, your data",
            "Zero-knowledge by design",
            "Open source transparency",
            "No hidden egress fees",
            "AES-256-GCM Encryption",
            "Zstd Compression",
            "Client-side processing natively",
            "Git LFS backed infinite storage",
            "Multi-provider platform support",
            "Absolute data portability",
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
              Take Back Control of Your Data
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-4 text-lg">
              Your files. Your keys. Your privacy. Zero cost.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="mt-10 relative inline-block">
              <MagneticButton
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-10 py-4 text-base font-semibold text-slate-900 hover:bg-emerald-400 transition-colors shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50"
              >
                Get started — it&apos;s free <ArrowRight className="h-4 w-4" />
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
