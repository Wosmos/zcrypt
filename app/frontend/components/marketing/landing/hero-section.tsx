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
import { ArrowRight, ChevronDown, Lock, Shield, Globe, Eye } from "@/lib/icons";
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

  const opacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const yTranslate = useTransform(scrollYProgress, [0, 0.6], [0, 40]);

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
      className="relative flex min-h-dvh items-center px-6 py-24 md:py-28 overflow-hidden"
    >
      {/* Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-[10%] -left-[10%] w-[70vw] h-[70vw] bg-cyan-500/15 dark:bg-cyan-500/10 rounded-full blur-[100px]"
        />
        <motion.div
          animate={{ opacity: [0.15, 0.35, 0.15] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute top-[10%] -right-[10%] w-[50vw] h-[50vw] bg-violet-500/15 dark:bg-violet-500/10 rounded-full blur-[100px]"
        />
      </div>

      <motion.div
        style={{ opacity, y: yTranslate }}
        className="relative z-10 mx-auto grid w-full max-w-3xl grid-cols-1 items-center gap-12"

      >
        {/* Left — copy */}
        <div className="flex flex-col items-center text-center"
>
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 text-xs font-medium text-cyan-600 dark:text-cyan-400 mb-2 backdrop-blur-sm"
          >
            <Shield className="h-3.5 w-3.5" />
            <span className="tracking-wide">Private by design</span>
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-[2.75rem] sm:text-6xl lg:text-7xl font-bold tracking-tight text-[var(--color-text)] dark:text-white leading-[1.12] font-heading capitalize"
          >
             <span className="mx-auto block w-fit px-1 pt-1 pb-3 italic leading-[1.2]  via-cyan-600 dark:via-cyan-300              
              bg-gradient-to-r from-cyan-500 to-cyan-400 bg-clip-text text-transparent dark:from-cyan-400 dark:to-cyan-300">
              Cloud Storage
            </span>
            You{" "}
            <Underlined variant="ink" delay={0.5}>
              Actually Own
            </Underlined>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="mt-6 text-base sm:text-lg text-[var(--color-text-secondary)] max-w-xl leading-relaxed"
          >
            Your files, encrypted before they ever leave your device. <br/>Stored in
            your own GitHub, GitLab, or Telegram ,{" "} <br />
            <Underlined variant="highlight" delay={0.6} >
              readable only by you
            </Underlined>
            .
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center gap-4 mt-9 w-full sm:w-auto"
          >
            <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-3.5 text-base font-semibold text-slate-900 bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] shadow-lg shadow-cyan-500/30 transition-shadow hover:shadow-xl hover:shadow-cyan-500/50">
                Create your vault 
              </Link>

            
          </motion.div>
        </div>

      </motion.div>
    </section>
  );
}
