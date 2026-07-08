"use client";

import { useInViewOnce } from "@/hooks/useInViewOnce";
import { cn } from "@/lib/utils";

// Client island for the scroll-reveal <Section> used by the long-form prose
// pages (terms, privacy, about, philosophy). Split out of prose.tsx so the
// static primitives there (PullQuote, BulletList) can stay server-rendered.

export function Section({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { ref, isVisible } = useInViewOnce<HTMLElement>("-80px");

  return (
    <section
      ref={ref}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10",
        className
      )}
    >
      {children}
    </section>
  );
}
