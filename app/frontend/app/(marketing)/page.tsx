"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  useMotionValue,
  useSpring,
  AnimatePresence,
} from "framer-motion";
import {
  Shield,
  ArrowRight,
  Lock,
  Zap,
  GitBranch,
  Eye,
  Scissors,
  HeartHandshake,
  ChevronDown,
  Quote,
  Check,
  X,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Magnetic Button ────────────────────────────────────────
function MagneticButton({
  children,
  className,
  href,
}: {
  children: React.ReactNode;
  className?: string;
  href: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) * 0.15);
    y.set((e.clientY - cy) * 0.15);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.a
      ref={ref}
      href={href}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
    >
      {children}
    </motion.a>
  );
}

// ─── Animated Word Reveal ───────────────────────────────────
function WordReveal({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.08, duration: 0.5, ease: "easeOut" }}
          className="inline-block mr-[0.3em]"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

// ─── Scroll Reveal ──────────────────────────────────────────
function ScrollReveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── 3D Tilt Card ───────────────────────────────────────────
function TiltCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springRotateX = useSpring(rotateX, { stiffness: 200, damping: 20 });
  const springRotateY = useSpring(rotateY, { stiffness: 200, damping: 20 });

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateX.set(py * -12);
    rotateY.set(px * 12);
  };

  const handleMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <motion.div
      ref={ref}
      style={{
        rotateX: springRotateX,
        rotateY: springRotateY,
        transformPerspective: 800,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Marquee ────────────────────────────────────────────────
function Marquee({
  items,
  reverse = false,
}: {
  items: string[];
  reverse?: boolean;
}) {
  return (
    <div className="overflow-hidden whitespace-nowrap">
      <motion.div
        className="inline-flex gap-8"
        animate={{ x: reverse ? ["0%", "-50%"] : ["-50%", "0%"] }}
        transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
      >
        {[...items, ...items].map((item, i) => (
          <span
            key={i}
            className="text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors cursor-default select-none"
          >
            {item}
            <span className="mx-4 text-[var(--color-border)]">&middot;</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
}

// ─── Counter ────────────────────────────────────────────────
function AnimatedCounter({ target }: { target: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const step = Math.ceil(target / 60);
    const interval = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(interval);
      } else {
        setCount(start);
      }
    }, 16);
    return () => clearInterval(interval);
  }, [isInView, target]);

  return <span ref={ref}>${count.toLocaleString()}</span>;
}

// ─── Main Page ──────────────────────────────────────────────
export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.8], [1, 0.95]);
  const [easterEgg, setEasterEgg] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Konami code easter egg
  useEffect(() => {
    const konami = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
    let pos = 0;
    const handler = (e: KeyboardEvent) => {
      if (e.keyCode === konami[pos]) {
        pos++;
        if (pos === konami.length) {
          setEasterEgg(true);
          setTimeout(() => setEasterEgg(false), 4000);
          pos = 0;
        }
      } else {
        pos = 0;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const features = [
    {
      icon: Lock,
      title: "AES-256-GCM",
      desc: "Military-grade encryption. Your files are safer than a billionaire's tax returns.",
      accent: "indigo",
    },
    {
      icon: Zap,
      title: "Zstd Compression",
      desc: "Shrinks files smaller than your cloud provider's conscience.",
      accent: "amber",
    },
    {
      icon: GitBranch,
      title: "Multi-Platform",
      desc: "GitHub, GitLab, Hugging Face. We play them against each other like a custody battle.",
      accent: "emerald",
    },
    {
      icon: Eye,
      title: "Zero-Knowledge",
      desc: "We literally cannot see your files. Not because we're polite — because math.",
      accent: "violet",
    },
    {
      icon: Scissors,
      title: "Auto-Chunking",
      desc: "Files too big? We shatter them into pieces and scatter them like Horcruxes.",
      accent: "rose",
    },
    {
      icon: HeartHandshake,
      title: "Free Forever",
      desc: "No credit card. No 'free trial.' No surprise invoice that ruins your Tuesday.",
      accent: "cyan",
    },
  ];

  const accentColors: Record<string, string> = {
    indigo: "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 ring-indigo-500/20",
    amber: "bg-amber-500/10 text-amber-500 dark:text-amber-400 ring-amber-500/20",
    emerald: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 ring-emerald-500/20",
    violet: "bg-violet-500/10 text-violet-500 dark:text-violet-400 ring-violet-500/20",
    rose: "bg-rose-500/10 text-rose-500 dark:text-rose-400 ring-rose-500/20",
    cyan: "bg-cyan-500/10 text-cyan-500 dark:text-cyan-400 ring-cyan-500/20",
  };

  const steps = [
    { num: "01", title: "Drop a file", desc: "Drag it in. We don't judge file types." },
    { num: "02", title: "We compress it", desc: "Zstd squeezes every wasted byte out." },
    { num: "03", title: "We encrypt it", desc: "AES-256-GCM. Your passphrase, your keys." },
    { num: "04", title: "We chunk it", desc: "Split into pieces, disguised as build artifacts." },
    { num: "05", title: "Cloud stores it free", desc: "Irony is a beautiful thing." },
  ];

  const pricing = [
    {
      name: "zpush",
      price: "$0",
      period: "/mo",
      desc: "Free. Actually free. Not 'free for 12 months then $49/mo' free.",
      features: ["Unlimited storage", "AES-256 encryption", "Multi-platform", "Zero-knowledge", "Open source"],
      highlight: true,
    },
    {
      name: "AWS S3",
      price: "$23",
      period: "/TB/mo",
      desc: "Plus egress fees. Plus request fees. Plus the fee for understanding their fees.",
      features: ["Egress fees extra", "Request fees extra", "Complex pricing", "They read your metadata"],
      highlight: false,
    },
    {
      name: "Google Cloud",
      price: "$20",
      period: "/TB/mo",
      desc: "They already have your emails. Why give them your files too?",
      features: ["Nearline surcharges", "Operations fees", "They index everything"],
      highlight: false,
    },
    {
      name: "Dropbox",
      price: "$12",
      period: "/mo for 2TB",
      desc: "They index your files 'for search.' Sure they do.",
      features: ["2TB cap", "They scan your files", "Sells metadata"],
      highlight: false,
    },
  ];

  const testimonials = [
    {
      quote: "I used to pay AWS $847/month for storage. Now I pay nothing and sleep better.",
      author: "A Developer Who Saw The Light",
    },
    {
      quote: "My boss asked where our backups go. I said 'Git repos disguised as build artifacts.' Got promoted.",
      author: "Senior Cloud Architect",
    },
    {
      quote: "I explained zpush to our security team. They said it was either genius or unhinged. I said yes.",
      author: "Anonymous CISO",
    },
  ];

  return (
    <>
      {/* Konami easter egg */}
      <AnimatePresence>
        {easterEgg && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setEasterEgg(false)}
          >
            <div className="text-center">
              <p className="text-6xl mb-4">&#9785;</p>
              <p className="text-2xl font-bold text-white">Cloud Provider Tears</p>
              <p className="text-sm text-zinc-400 mt-2">Collected fresh from AWS billing disputes</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ HERO ═══ */}
      <motion.section
        ref={heroRef}
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="relative min-h-dvh flex flex-col items-center justify-center px-4 pt-20 overflow-hidden"
      >
        {/* Gradient orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-500/10 dark:bg-violet-500/5 rounded-full blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text-secondary)] mb-8"
        >
          <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
          Open source &amp; free forever
        </motion.div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-center max-w-4xl leading-[1.1]">
          <WordReveal text="Your Files Deserve Better Than Jeff Bezos's Garage" />
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="text-base sm:text-lg text-[var(--color-text-secondary)] text-center max-w-2xl mt-6 leading-relaxed"
        >
          zpush encrypts, compresses, and stashes your data in free Git repos.
          Because $0.023/GB/month is for people who enjoy burning money.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1, duration: 0.5 }}
          className="flex flex-col sm:flex-row gap-3 mt-10"
        >
          <MagneticButton
            href="/register"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40"
          >
            Start for free <ArrowRight className="h-4 w-4" />
          </MagneticButton>
          <Link
            href="#features"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-8 py-3.5 text-sm font-medium hover:bg-[var(--color-surface-1)] transition-colors"
          >
            See how it works
          </Link>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8 }}
          className="absolute bottom-8"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <ChevronDown className="h-5 w-5 text-[var(--color-text-muted)]" />
          </motion.div>
        </motion.div>
      </motion.section>

      {/* ═══ CLOUD ROAST TICKER ═══ */}
      <section className="py-8 border-y border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
        <Marquee
          items={[
            "AWS S3 charges you $23/TB/month",
            "Google Cloud marked up storage 4,000%",
            "Azure has 47 pricing tiers for the same thing",
            "Dropbox sells your metadata",
            "iCloud won't let you leave",
            "OneDrive scans your files for 'safety'",
          ]}
        />
        <div className="h-3" />
        <Marquee
          reverse
          items={[
            "zpush: $0/month forever",
            "Your passphrase never leaves your device",
            "AES-256-GCM encryption",
            "Open source — read the code",
            "Zero-knowledge architecture",
            "Disguised as build artifacts",
          ]}
        />
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" className="py-24 px-4">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal className="text-center mb-16">
            <p className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-3">
              Features
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Everything you need. Nothing you don&apos;t.
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-3 max-w-lg mx-auto">
              No feature gates. No premium tiers. Every feature is free because
              charging for security is a scam.
            </p>
          </ScrollReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, i) => (
              <ScrollReveal key={feature.title} delay={i * 0.08}>
                <TiltCard className="card p-6 h-full">
                  <div
                    className={cn(
                      "inline-flex items-center justify-center h-11 w-11 rounded-xl ring-1 mb-4",
                      accentColors[feature.accent]
                    )}
                  >
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1.5">{feature.title}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {feature.desc}
                  </p>
                </TiltCard>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="py-24 px-4 bg-[var(--color-surface)]">
        <div className="mx-auto max-w-3xl">
          <ScrollReveal className="text-center mb-16">
            <p className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-3">
              How it works
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Five steps to freedom
            </h2>
          </ScrollReveal>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-[var(--color-border)]" />

            <div className="space-y-0">
              {steps.map((step, i) => (
                <ScrollReveal key={step.num} delay={i * 0.1}>
                  <div className="relative flex gap-5 py-6">
                    <div className="relative z-10 flex items-center justify-center h-12 w-12 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-xs font-bold text-indigo-500 dark:text-indigo-400 flex-shrink-0">
                      {step.num}
                    </div>
                    <div className="pt-1">
                      <h3 className="text-sm font-semibold">{step.title}</h3>
                      <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="pricing" className="py-24 px-4">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal className="text-center mb-16">
            <p className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-3">
              Pricing
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              The price comparison nobody asked for
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-3 max-w-lg mx-auto">
              Spoiler: we win. By a lot.
            </p>
          </ScrollReveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {pricing.map((plan, i) => (
              <ScrollReveal key={plan.name} delay={i * 0.08}>
                <div
                  className={cn(
                    "rounded-2xl border p-6 h-full flex flex-col",
                    plan.highlight
                      ? "border-indigo-500/30 bg-indigo-500/5 ring-1 ring-indigo-500/20 shadow-lg shadow-indigo-500/10"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] opacity-75"
                  )}
                >
                  <div className="mb-4">
                    <div className="flex items-baseline gap-1">
                      {plan.highlight ? (
                        <span className="text-4xl font-bold text-indigo-500 dark:text-indigo-400">
                          {plan.price}
                        </span>
                      ) : (
                        <span className="text-4xl font-bold line-through decoration-red-500/60 text-[var(--color-text-muted)]">
                          {plan.price}
                        </span>
                      )}
                      <span className="text-sm text-[var(--color-text-muted)]">
                        {plan.period}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold mt-2">{plan.name}</h3>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 leading-relaxed">
                      {plan.desc}
                    </p>
                  </div>

                  <ul className="space-y-2 mt-auto pt-4 border-t border-[var(--color-border)]">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]"
                      >
                        {plan.highlight ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-red-500/60 flex-shrink-0 mt-0.5" />
                        )}
                        {f}
                      </li>
                    ))}
                  </ul>

                  {plan.highlight && (
                    <Link
                      href="/register"
                      className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-medium text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/25"
                    >
                      Get started free <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal className="text-center mt-8">
            <p className="text-sm text-[var(--color-text-muted)]">
              Estimated money saved by switching to zpush:{" "}
              <span className="font-bold text-emerald-500 dark:text-emerald-400 tabular-nums">
                <AnimatedCounter target={47832} />
              </span>
              /year (and counting)
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ═══ TESTIMONIALS ═══ */}
      <section className="py-24 px-4 bg-[var(--color-surface)]">
        <div className="mx-auto max-w-5xl">
          <ScrollReveal className="text-center mb-16">
            <p className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider mb-3">
              Testimonials
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              People who stopped bleeding money
            </h2>
          </ScrollReveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {testimonials.map((t, i) => (
              <ScrollReveal key={i} delay={i * 0.1}>
                <div className="card p-6 h-full flex flex-col">
                  <Quote className="h-5 w-5 text-indigo-500/30 mb-3 flex-shrink-0" />
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

      {/* ═══ CTA ═══ */}
      <section className="py-32 px-4 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-500/5 to-transparent" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/8 dark:bg-indigo-500/3 rounded-full blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-2xl text-center">
          <ScrollReveal>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
              Stop Paying Rent on Your Own Data
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-4 text-lg">
              Your files. Your keys. Your freedom. Zero dollars.
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <div className="mt-10 relative inline-block">
              <MagneticButton
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-10 py-4 text-base font-semibold text-white hover:bg-indigo-500 transition-colors shadow-2xl shadow-indigo-500/30 hover:shadow-indigo-500/50"
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

// ─── Hover reveal easter egg ────────────────────────────────
function HoverReveal() {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div
      className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-64"
      onMouseEnter={() => {
        timerRef.current = setTimeout(() => setShow(true), 3000);
      }}
      onMouseLeave={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setShow(false);
      }}
    >
      <AnimatePresence>
        {show && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-[var(--color-text-muted)] text-center italic"
          >
            seriously, it&apos;s free. we&apos;re not kidding.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
