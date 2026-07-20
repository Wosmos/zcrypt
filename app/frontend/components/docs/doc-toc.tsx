"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface TocItem {
  id: string;
  title: string;
}

/**
 * "On this page" list with an IntersectionObserver-driven active section.
 * A narrow band near the top of the viewport decides which section is
 * "current"; clicking an entry smooth-scrolls (respecting reduced motion)
 * and updates the hash without a jump.
 */
export function DocToc({ toc }: { toc: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const visibleIds = useRef(new Set<string>());

  useEffect(() => {
    const headings = toc
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleIds.current.add(entry.target.id);
          else visibleIds.current.delete(entry.target.id);
        }
        // First TOC entry currently inside the band wins — keeps DOM order.
        const current = toc.find((item) => visibleIds.current.has(item.id));
        if (current) setActiveId(current.id);
      },
      // Band: from just below the fixed navbar to ~35% down the viewport.
      { rootMargin: "-96px 0px -65% 0px", threshold: 0 }
    );

    headings.forEach((el) => observer.observe(el));
    const ids = visibleIds.current;
    return () => {
      observer.disconnect();
      ids.clear();
    };
  }, [toc]);

  function handleClick(e: React.MouseEvent, id: string) {
    const el = document.getElementById(id);
    if (!el) return; // fall back to the default anchor jump
    e.preventDefault();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    window.history.pushState(null, "", `#${id}`);
    setActiveId(id);
  }

  if (toc.length === 0) return null;

  return (
    <nav aria-label="On this page" className="card mt-8 p-5">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
        On this page
      </h2>
      <ul className="list-none space-y-0.5">
        {toc.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(e) => handleClick(e, item.id)}
                aria-current={active ? "location" : undefined}
                className={cn(
                  "block border-l-2 py-1 pl-4 text-sm transition-colors",
                  active
                    ? "border-cyan-500 font-medium text-cyan-700 dark:text-cyan-300"
                    : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]"
                )}
              >
                {item.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
