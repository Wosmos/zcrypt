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
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  features,
  accentColors,
  steps,
  testimonials,
  faqs,
  roadmapItems,
  marqueeItems,
} from "@/lib/data";

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
import { Underlined } from "@/components/marketing/landing/pencil-underline";
import { AnimatedCounter } from "@/components/marketing/landing/animated-counter";
import { HoverReveal } from "@/components/marketing/landing/hover-reveal";
import { MacOSShowcase } from "@/components/marketing/macos-showcase";
import { BentoGrid } from "@/components/marketing/landing/bento-grid";
import { PricingSection } from "@/components/marketing/landing/product-prising";
import {
  FAQJsonLd,
  SoftwareApplicationJsonLd,
} from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "zcrypt — Private Cloud Storage That Costs Less",
  description:
    "Free encrypted cloud storage with zero-knowledge AES-256 encryption. 10 GB free, open source, no credit card. Secure alternative to Dropbox, Google Drive, and iCloud.",
  alternates: {
    canonical: "https://zcrypt.cloud",
  },
  openGraph: {
    title: "zcrypt — Private Cloud Storage That Costs Less",
    description:
      "Free zero-knowledge encrypted cloud storage. 10 GB free, military-grade AES-256 encryption, open source. Your files, your keys.",
    url: "https://zcrypt.cloud",
  },
};

// ─── Icon Maps (Server Component can reference client components) ───

const featureIconMap: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  Lock,
  Eye,
  Zap,
  GitBranch,
  Scissors,
  HeartHandshake,
};

const roadmapIconMap: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  Terminal,
  Smartphone,
  Share2,
  Image,
};

// ─── Page (Server Component) ─────────────────────────────────

export default function LandingPage() {
  const largeFeatures = features.filter((f) => f.large);
  const smallFeatures = features.filter((f) => !f.large);

  return (
    <>
      <SoftwareApplicationJsonLd />
      <FAQJsonLd faqs={faqs} />

      {/* ═══ HERO (Client Island) ═══ */}
      <HeroSection />

      {/* ═══ CLOUD FEATURES TICKER ═══ */}
      <section className=" border-y border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <Marquee items={marqueeItems} />
      </section>

      {/* ═══ FEATURES — BENTO GRID ═══ */}
      <BentoGrid />

      {/* ═══ APP SHOWCASE ═══ */}
      <section className="py-24 px-4 bg-[var(--color-surface)] overflow-hidden">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal className="text-center mb-16">
            <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-3">
              Experience
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              See it <em className="italic">in action</em>
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
            <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-3">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              How it works
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
            <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-3">
              Testimonials
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Trusted by thousands
            </h2>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {testimonials.map((t, i) => (
              <ScrollReveal key={i} delay={i * 0.1}>
                <div className="card p-6 h-full flex flex-col">
                  <Quote aria-hidden="true" className="h-5 w-5 text-cyan-500/30 mb-3 flex-shrink-0" />
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

          <ScrollReveal>
            <div className="flex flex-col gap-3">
              {faqs.map((faq, i) => (
                <FAQItem key={i} question={faq.q} answer={faq.a}  />
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ COMING SOON ═══ */}
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
              Big things are coming. Here&apos;s a taste of what&apos;s next.
            </p>
          </ScrollReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {roadmapItems.map((item, i) => {
              const Icon = roadmapIconMap[item.icon];
              return (
                <ScrollReveal key={i} delay={i * 0.1}>
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
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="py-32 px-4 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/8 dark:bg-cyan-500/3 rounded-full blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-2xl text-center">
          <ScrollReveal>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              Your Files Deserve <Underlined variant="highlight"><em className="italic">Better</em></Underlined>
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-4 text-lg">
              10 GB free. Zero-knowledge encryption. No credit card required.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="mt-10 relative inline-block">
              <MagneticButton
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-10 py-4 text-base font-semibold text-slate-900 hover:bg-cyan-400 transition-colors shadow-2xl shadow-cyan-500/30 hover:shadow-cyan-500/50"
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
