"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight } from "@/lib/icons";

const STEPS = [
  "9.99",
  "7.99",
  "5.99",
  "4.99",
  "3.99",
  "2.99",
  "1.99",
  "0.99",
  "0.49",
  "0.19",
  "0.09",
  "0",
] as const;
const STEP_MS = 900 / STEPS.length;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The price, said once, very large. */
export function PriceZero() {
  const numRef = useRef<HTMLSpanElement>(null);
  const [step, setStep] = useState(STEPS.length - 1);

  useIsoLayoutEffect(() => {
    const el = numRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.6) return;
    setStep(0);
    let timer = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        let i = 0;
        timer = window.setInterval(() => {
          i += 1;
          setStep(i);
          if (i >= STEPS.length - 1) window.clearInterval(timer);
        }, STEP_MS);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  const value = STEPS[step];
  const done = step === STEPS.length - 1;

  return (
    <section id="price" className="pv2-sec zs-price" aria-labelledby="h-price">
      <div className="pv2-wrap zs-price-c">
        <p className="pv2-eyebrow">Price</p>
        <h2 id="h-price" className="zs-bignum">
          <span className="sr-only">It costs $0</span>
          <span ref={numRef} aria-hidden="true" className="zs-bignum-v" data-done={done}>
            <span className="zs-wash" />
            <span className="zs-cur">$</span>
            <span className="zs-zero">{value}</span>
          </span>
        </h2>
        <p className="zs-per">Per month. Per year. Per forever.</p>
        <p className="zs-pbody">
          There is no Pro plan. There is no Plus plan. There is definitely no Premium Ultra plan.
          Your files live in accounts you already have, so there&apos;s no warehouse to rent and
          nothing to bill you for.
        </p>
        <Link
          href="/register"
          className="mt-8 inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#2de0ed] via-[#00d5e4] to-[#0093a3] px-8 text-base font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition-shadow duration-200 hover:shadow-xl hover:shadow-cyan-500/50"
        >
          Start free
          <ArrowRight className="size-4" />
        </Link>
        <p className="zs-thanks">
          Want to say thanks anyway?{" "}
          <a href="https://github.com/Wosmos/zcrypt" className="zs-link" rel="noopener">
            Star it on GitHub
          </a>
          . It costs exactly the same.
        </p>
      </div>
    </section>
  );
}
