"use client";

import { useInViewOnce } from "@/hooks/useInViewOnce";
import { cn } from "@/lib/utils";

export function ScrollReveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, isVisible } = useInViewOnce<HTMLDivElement>("-60px");

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
      className={cn(
        "transition-[opacity,transform] duration-[600ms] ease-out",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[30px]",
        className
      )}
    >
      {children}
    </div>
  );
}
