import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Shield,
  HardDrive,
  Zap,
  Lock,
  Check,
  HelpCircle,
  Globe,
} from "@/lib/icons";
import { faqs } from "@/lib/data";
import { PricingSection } from "@/components/marketing/landing/product-prising";
import { FAQItem } from "@/components/marketing/landing/faq-item";
import { ScrollReveal } from "@/components/marketing/landing/scroll-reveal";

export const metadata: Metadata = {
  title: "Pricing — zcrypt",
  description:
    "Simple, transparent pricing. 10 GB free with military-grade encryption. Upgrade to Plus or Pro for more storage, bigger files, and full control.",
};

const whyItems = [
  {
    icon: Shield,
    title: "Every plan is encrypted",
    desc: "Zero-knowledge encryption on every plan. Free or paid, your files are private by default.",
  },
  {
    icon: HardDrive,
    title: "No hidden storage fees",
    desc: "What you see is what you get. No egress fees, no bandwidth charges, no surprise invoices.",
  },
  {
    icon: Zap,
    title: "No feature gating on security",
    desc: "We don't charge extra for encryption. Every user gets the same military-grade protection.",
  },
  {
    icon: Globe,
    title: "Open source, always",
    desc: "Our code is public. You can audit exactly what happens to your data on any plan.",
  },
];

const includedOnEveryPlan = [
  "Zero-knowledge encryption",
  "Multi-platform storage",
  "Web app access",
  "File sharing",
  "Drag-and-drop uploads",
  "Dark mode",
];

export default function PricingPage() {
  // Filter FAQs relevant to pricing
  const pricingFaqs = faqs.filter(
    (f) =>
      f.q.toLowerCase().includes("pricing") ||
      f.q.toLowerCase().includes("storage") ||
      f.q.toLowerCase().includes("free") ||
      f.q.toLowerCase().includes("cheaper") ||
      f.q.toLowerCase().includes("byob") ||
      f.q.toLowerCase().includes("passphrase")
  );

  return (
    <>
      {/* ═══ HERO ═══ */}
      <section className="py-24 md:py-32 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/5 text-xs font-medium text-cyan-600 dark:text-cyan-400 mb-6">
            <Lock className="h-3.5 w-3.5" />
            Transparent pricing
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight font-heading leading-[1.08]">
            Privacy shouldn&apos;t{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
              cost a fortune.
            </span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-[var(--color-text-secondary)] max-w-xl mx-auto leading-relaxed">
            More storage, stronger encryption, lower price than the big guys.
            Start free, upgrade when you need more.
          </p>
        </div>
      </section>

      {/* ═══ PRICING CARDS (reused component) ═══ */}
      <PricingSection />

      {/* ═══ INCLUDED ON EVERY PLAN ═══ */}
      <section className="py-24 px-4 bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
          <ScrollReveal className="text-center mb-12">
            <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-3">
              No gotchas
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Included on every plan
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-3 max-w-lg mx-auto">
              We don&apos;t lock basic features behind a paywall. Here&apos;s
              what you get on every plan, including Free.
            </p>
          </ScrollReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto">
            {includedOnEveryPlan.map((item) => (
              <div key={item} className="flex items-center gap-3">
                <Check className="h-4 w-4 text-cyan-500 shrink-0" />
                <span className="text-sm text-[var(--color-text)]">
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WHY OUR PRICING IS DIFFERENT ═══ */}
      <section className="py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <ScrollReveal className="text-center mb-16">
            <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider mb-3">
              Our approach
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Why we&apos;re cheaper and better
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-3 max-w-lg mx-auto">
              We use a fundamentally different architecture. Instead of
              expensive centralized data centers, we use distributed Git-based
              storage — which means lower costs passed directly to you.
            </p>
          </ScrollReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {whyItems.map((item, i) => (
              <ScrollReveal key={i} delay={i * 0.1}>
                <div className="card p-6 h-full">
                  <div className="mb-4 inline-flex items-center justify-center h-10 w-10 rounded-lg bg-cyan-500/10 text-cyan-500">
                    <item.icon size={20} />
                  </div>
                  <h3 className="text-sm font-bold mb-1">{item.title}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      {pricingFaqs.length > 0 && (
        <section className="py-24 px-4 bg-[var(--color-surface)]">
          <div className="max-w-3xl mx-auto">
            <ScrollReveal className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-medium text-[var(--color-text-secondary)] mb-4">
                <HelpCircle className="h-3.5 w-3.5 text-cyan-500" />
                FAQ
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Common questions
              </h2>
            </ScrollReveal>

            <div className="flex flex-col gap-3">
              {pricingFaqs.map((faq, i) => (
                <FAQItem key={i} question={faq.q} answer={faq.a} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ CTA ═══ */}
      <section className="py-24 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Start with 10 GB free
          </h2>
          <p className="text-[var(--color-text-secondary)] mt-4 text-lg">
            No credit card required. Upgrade or cancel anytime.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-8 py-3.5 text-sm font-bold text-slate-900 hover:bg-cyan-400 transition-colors shadow-lg shadow-cyan-500/20"
            >
              Create free account
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
