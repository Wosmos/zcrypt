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
  useMotionTemplate,
  AnimatePresence,
} from "framer-motion";
import { MacOSShowcase } from "@/components/marketing/macos-showcase";
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
  HelpCircle,
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

// ─── Animated Border Card ──────────────────────────────────
function AnimatedBorderCard({
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
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left);
    mouseY.set(e.clientY - rect.top);
  };

  const background = useMotionTemplate`radial-gradient(300px at ${mouseX}px ${mouseY}px, rgba(16,185,129,0.12), transparent 80%)`;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      onMouseMove={handleMouseMove}
      className={cn("relative group", className)}
    >
      {/* Animated gradient border */}
      <div className="absolute -inset-px rounded-2xl overflow-hidden">
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background:
              "conic-gradient(from var(--border-angle, 0deg), transparent 30%, rgba(16,185,129,0.3) 50%, transparent 70%)",
            animation: "borderRotate 4s linear infinite",
          }}
        />
      </div>
      {/* Spotlight glow on hover */}
      <motion.div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

// ─── Animated Timeline Line ────────────────────────────────
function AnimatedTimelineLine() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start center", "end center"],
  });
  const scaleY = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
  });

  return (
    <div ref={ref} className="absolute left-6 top-0 bottom-0 w-px">
      {/* Background track */}
      <div className="absolute inset-0 bg-[var(--color-border)]" />
      {/* Animated fill */}
      <motion.div
        className="absolute top-0 left-0 right-0 bg-emerald-500 origin-top"
        style={{ scaleY, height: "100%" }}
      />
      {/* Glow at the tip */}
      <motion.div
        className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 blur-[2px]"
        style={{
          top: useTransform(scaleY, (v) => `calc(${v * 100}% - 6px)`),
        }}
      />
    </div>
  );
}

// ─── Timeline Step ─────────────────────────────────────────
function TimelineStep({
  step,
  index,
}: {
  step: { num: string; title: string; desc: string };
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -20 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.1, ease: "easeOut" }}
    >
      <div className="relative flex gap-5 py-6">
        <motion.div
          className="relative z-10 flex items-center justify-center h-12 w-12 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)] text-xs font-bold text-emerald-600 dark:text-emerald-400 flex-shrink-0"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={isInView ? { scale: 1, opacity: 1 } : {}}
          transition={{
            duration: 0.4,
            delay: 0.1 + index * 0.1,
            type: "spring",
            stiffness: 300,
          }}
        >
          {step.num}
        </motion.div>
        <div className="pt-1">
          <h3 className="text-sm font-semibold">{step.title}</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
            {step.desc}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── FAQ Item ───────────────────────────────────────────────
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[var(--color-border)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-5 text-left group cursor-pointer"
      >
        <span className="text-sm font-semibold pr-4">{question}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-200 flex-shrink-0",
            open && "rotate-180"
          )}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-sm text-[var(--color-text-secondary)] leading-relaxed">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
      accent: "emerald",
      large: true,
    },
    {
      icon: Eye,
      title: "Zero-Knowledge",
      desc: "We literally cannot see your files. Not because we're polite — because math.",
      accent: "violet",
      large: true,
    },
    {
      icon: Zap,
      title: "Zstd Compression",
      desc: "Shrinks files smaller than your cloud provider's conscience.",
      accent: "amber",
      large: false,
    },
    {
      icon: GitBranch,
      title: "Multi-Platform",
      desc: "GitHub, GitLab, Hugging Face. We play them against each other like a custody battle.",
      accent: "emerald",
      large: false,
    },
    {
      icon: Scissors,
      title: "Auto-Chunking",
      desc: "Files too big? We shatter them into pieces and scatter them like Horcruxes.",
      accent: "rose",
      large: false,
    },
    {
      icon: HeartHandshake,
      title: "Free Forever",
      desc: "No credit card. No 'free trial.' No surprise invoice that ruins your Tuesday.",
      accent: "cyan",
      large: false,
    },
  ];

  const accentColors: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-500 dark:text-amber-400 ring-amber-500/20",
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

  const faqs = [
    {
      q: "Is this really free forever?",
      a: "Yes. zpush is open source and uses free Git LFS storage from platforms like GitHub, GitLab, and Hugging Face. There are no hidden costs, no premium tiers, and no surprise invoices. The software itself will always be free.",
    },
    {
      q: "What happens if GitHub changes their storage limits?",
      a: "zpush supports multiple platforms. If one provider changes their terms, you can migrate to another with a single command. Your data is portable because it's yours — encrypted and chunked in a standard format.",
    },
    {
      q: "How secure is the encryption?",
      a: "We use AES-256-GCM, the same standard used by governments and financial institutions. Your passphrase never leaves your device. We physically cannot decrypt your files — that's zero-knowledge architecture, not a marketing buzzword.",
    },
    {
      q: "Can I access my files from multiple devices?",
      a: "Absolutely. Install zpush on any device, connect your Git platform accounts, and pull your encrypted files. You'll just need your passphrase to decrypt them.",
    },
    {
      q: "What file size limits exist?",
      a: "zpush automatically chunks large files into 80MB pieces to work within Git LFS limits. There's no practical upper limit on file size — we've tested with files over 100GB.",
    },
    {
      q: "Is my passphrase stored anywhere?",
      a: "No. Your passphrase is used locally to derive encryption keys and is never transmitted or stored. If you lose it, your files are unrecoverable. That's the price of real security — and it's a feature, not a bug.",
    },
  ];

  const largeFeatures = features.filter((f) => f.large);
  const smallFeatures = features.filter((f) => !f.large);

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
              <p className="text-sm text-slate-400 mt-2">Collected fresh from AWS billing disputes</p>
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
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-teal-500/10 dark:bg-teal-500/5 rounded-full blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text-secondary)] mb-8"
        >
          <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
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
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-3.5 text-sm font-semibold text-slate-900 hover:bg-emerald-400 transition-colors shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40"
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

      {/* ═══ FEATURES — BENTO GRID ═══ */}
      <section id="features" className="py-24 px-4">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal className="text-center mb-16">
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3">
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

          {/* Bento: 2 large cards on top, 4 small below */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            {largeFeatures.map((feature, i) => (
              <AnimatedBorderCard key={feature.title} delay={i * 0.1}>
                <TiltCard className="card p-8 h-full">
                  <div
                    className={cn(
                      "inline-flex items-center justify-center h-14 w-14 rounded-2xl ring-1 mb-5",
                      accentColors[feature.accent]
                    )}
                  >
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed max-w-md">
                    {feature.desc}
                  </p>
                </TiltCard>
              </AnimatedBorderCard>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {smallFeatures.map((feature, i) => (
              <AnimatedBorderCard key={feature.title} delay={0.2 + i * 0.08}>
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
              </AnimatedBorderCard>
            ))}
          </div>
        </div>
      </section>

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
              A native-feeling experience. Drag, drop, encrypted. It&apos;s that simple.
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
            {/* Animated vertical line */}
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
      <section id="pricing" className="py-24 px-4">
        <div className="mx-auto max-w-6xl">
          <ScrollReveal className="text-center mb-16">
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3">
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
                      ? "border-emerald-500/30 bg-emerald-500/5 ring-1 ring-emerald-500/20 shadow-lg shadow-emerald-500/10"
                      : "border-[var(--color-border)] bg-[var(--color-surface)] opacity-75"
                  )}
                >
                  <div className="mb-4">
                    <div className="flex items-baseline gap-1">
                      {plan.highlight ? (
                        <span className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
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
                      className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-medium text-slate-900 hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/25"
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
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-3">
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
              The stuff you actually want to know before trusting us with your files.
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
