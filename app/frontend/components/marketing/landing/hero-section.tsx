"use client";

import { useRef, useEffect, useState } from "react";
import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useMotionValue,
  AnimatePresence,
} from "motion/react";
import { ArrowRight, Sparkles, ChevronDown, Lock, Shield } from "@/lib/icons";
import { Underlined } from "./pencil-underline";

export function MagneticButton({
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
  const springX = useSpring(x, { stiffness: 200, damping: 15 });
  const springY = useSpring(y, { stiffness: 200, damping: 15 });

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || window.innerWidth < 768) return;
    const rect = el.getBoundingClientRect();
    x.set((e.clientX - (rect.left + rect.width / 2)) * 0.2);
    y.set((e.clientY - (rect.top + rect.height / 2)) * 0.2);
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

export function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [easterEgg, setEasterEgg] = useState(false);

  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const yTranslate = useTransform(scrollYProgress, [0, 0.5], [0, 50]);

  useEffect(() => {
    const konami = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
    let pos = 0;
    const handler = (e: KeyboardEvent) => {
      if (e.key === konami[pos]) {
        pos++;
        if (pos === konami.length) {
          setEasterEgg(true);
          setTimeout(() => setEasterEgg(false), 4000);
          pos = 0;
        }
      } else { pos = 0; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative min-h-[92dvh] flex flex-col items-center justify-center px-6 py-20 md:py-32 overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

        <motion.div
          animate={{ opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[10%] -left-[10%] w-[70vw] h-[70vw] bg-cyan-500/10 rounded-full blur-[100px]"
        />
        <motion.div
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-[10%] -right-[10%] w-[50vw] h-[50vw] bg-violet-500/10 rounded-full blur-[100px]"
        />
      </div>

      <motion.div
        style={{ opacity, y: yTranslate }}
        className="flex flex-col items-center text-center max-w-6xl mx-auto z-10"
      >
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 text-sm font-medium text-cyan-600 dark:text-cyan-400 mb-8 backdrop-blur-sm"
        >
          <Lock className="h-3.5 w-3.5" />
          <span className="tracking-wide">Private by design</span>
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-[2.5rem] sm:text-5xl md:text-6xl lg:text-[4.5rem] font-bold tracking-tight text-slate-900 dark:text-white leading-[1.08] font-heading"
        >
          <span className="block sm:inline">Your Files.</span>{" "}
          <Underlined variant="ink" delay={0.5}>
            Your Keys.
          </Underlined>
          <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-cyan-300 to-blue-500">
            <em className="italic">Zero</em> Compromises.
          </span>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="mt-7 text-base sm:text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-2xl leading-relaxed"
        >
          Private cloud storage that costs less than Dropbox — and{" "}
          <Underlined variant="highlight" delay={0.6} className="text-slate-800 dark:text-slate-200 font-medium">
            nobody can see your files.
          </Underlined>{" "}
          Not even us.
        </motion.p>

        {/* Trust signals */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex items-center gap-5 mt-5 text-xs text-slate-400 dark:text-slate-500"
        >
          <span className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5 text-cyan-500/60" />
            Military-grade encryption
          </span>
          <span className="h-3 w-px bg-slate-300 dark:bg-slate-700" />
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-cyan-500/60" />
            10 GB Free
          </span>
          <span className="h-3 w-px bg-slate-300 dark:bg-slate-700" />
          <span>No credit card</span>
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="flex flex-col sm:flex-row items-center gap-4 mt-10 w-full sm:w-auto"
        >
          <MagneticButton
            href="/register"
            className="group relative inline-flex h-14 items-center justify-center gap-2.5 rounded-xl bg-cyan-500 dark:bg-cyan-500 px-10 text-sm font-bold text-slate-900 dark:text-slate-900 transition-all hover:scale-[1.02] active:scale-[0.98] hover:shadow-xl hover:shadow-cyan-500/25 w-full sm:w-auto overflow-hidden"
          >
            <span>Start for free</span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            {/* Shine effect */}
            <motion.span
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
              initial={{ x: "-100%" }}
              animate={{ x: "200%" }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
            />
          </MagneticButton>

          <Link
            href="#features"
            className="group inline-flex h-14 items-center justify-center gap-2 px-8 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors w-full sm:w-auto"
          >
            See how it works
            <ChevronDown className="h-3.5 w-3.5 group-hover:translate-y-0.5 transition-transform" />
          </Link>
        </motion.div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="absolute bottom-8 hidden md:flex flex-col items-center gap-2"
      >
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-30 font-heading">
          Scroll
        </span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="h-4 w-4 opacity-30" />
        </motion.div>
      </motion.div>

      {/* Easter Egg Overlay */}
      <AnimatePresence>
        {easterEgg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md"
            onClick={() => setEasterEgg(false)}
          >
            <div className="text-center p-6">
              <p className="text-5xl mb-4">💧</p>
              <p className="text-xl font-bold text-white">Cloud Provider Tears</p>
              <p className="text-sm text-slate-400 mt-2">Zero egress fees. Zero storage fees.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
