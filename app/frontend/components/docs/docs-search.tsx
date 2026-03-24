"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Fuse from "fuse.js";
import { Search, ArrowRight } from "@/lib/icons";
import { docsSearchIndex, type SearchEntry } from "@/lib/docs-search-index";

const fuse = new Fuse(docsSearchIndex, {
  keys: [
    { name: "title", weight: 0.4 },
    { name: "tags", weight: 0.35 },
    { name: "content", weight: 0.15 },
    { name: "section", weight: 0.1 },
  ],
  threshold: 0.4,
  distance: 120,
  includeMatches: true,
  minMatchCharLength: 2,
});

const sectionColors: Record<string, { text: string; bg: string }> = {
  "Getting Started": { text: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-500/10" },
  Security: { text: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10" },
  Tools: { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  "Platform Adapters": { text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10" },
  "Terminal App": { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
};

function highlightMatch(text: string, indices: readonly [number, number][] | undefined) {
  if (!indices || indices.length === 0) return text;
  const parts: { text: string; highlight: boolean }[] = [];
  let lastEnd = 0;
  for (const [start, end] of indices) {
    if (start > lastEnd) parts.push({ text: text.slice(lastEnd, start), highlight: false });
    parts.push({ text: text.slice(start, end + 1), highlight: true });
    lastEnd = end + 1;
  }
  if (lastEnd < text.length) parts.push({ text: text.slice(lastEnd), highlight: false });
  return (
    <>
      {parts.map((p, i) =>
        p.highlight ? (
          <mark key={i} className="bg-cyan-500/20 text-inherit rounded-sm px-0.5">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

export default function DocsSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const results = useMemo(() => {
    if (query.length < 2) return [];
    return fuse.search(query, { limit: 8 });
  }, [query]);

  const showResults = open && query.length >= 2 && results.length > 0;
  const showEmpty = open && query.length >= 2 && results.length === 0;

  // Reset active index on new results
  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  // Click outside to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Keyboard shortcut: / to focus
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const navigate = useCallback(
    (entry: SearchEntry) => {
      setOpen(false);
      setQuery("");
      router.push(entry.href);
    },
    [router]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      scrollActive(activeIndex + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      scrollActive(activeIndex - 1);
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      navigate(results[activeIndex].item);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function scrollActive(index: number) {
    if (!resultsRef.current) return;
    const el = resultsRef.current.children[index] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl mx-auto">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search docs..."
          className="w-full pl-11 pr-14 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--color-text-muted)] bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-md">
          /
        </kbd>
      </div>

      {/* Results dropdown */}
      {showResults && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl shadow-black/10 dark:shadow-black/30 overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-[var(--color-border)]">
            <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div ref={resultsRef} className="max-h-[360px] overflow-y-auto overscroll-contain">
            {results.map((result, i) => {
              const { item } = result;
              const colors = sectionColors[item.section] ?? sectionColors["Getting Started"];
              const titleMatch = result.matches?.find((m) => m.key === "title");
              const contentMatch = result.matches?.find((m) => m.key === "content");

              return (
                <button
                  key={`${item.href}-${item.title}`}
                  onClick={() => navigate(item)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${
                    i === activeIndex
                      ? "bg-[var(--color-surface-1)]"
                      : "hover:bg-[var(--color-surface-1)]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                        {item.section}
                      </span>
                    </div>
                    <p className="text-sm font-semibold truncate">
                      {titleMatch
                        ? highlightMatch(item.title, titleMatch.indices as unknown as [number, number][])
                        : item.title}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2 mt-0.5 leading-relaxed">
                      {contentMatch
                        ? highlightMatch(
                            item.content.slice(0, 120),
                            (contentMatch.indices as unknown as [number, number][]).filter(
                              ([s]) => s < 120
                            )
                          )
                        : item.content.slice(0, 120)}
                      ...
                    </p>
                  </div>
                  <ArrowRight
                    className={`h-3.5 w-3.5 flex-shrink-0 mt-4 transition-opacity ${
                      i === activeIndex
                        ? "text-cyan-500 opacity-100"
                        : "opacity-0"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-[var(--color-border)] flex items-center gap-3 text-[10px] text-[var(--color-text-muted)]">
            <span>
              <kbd className="font-mono font-bold px-1 py-0.5 rounded bg-[var(--color-surface-1)] border border-[var(--color-border)]">
                ↑↓
              </kbd>{" "}
              navigate
            </span>
            <span>
              <kbd className="font-mono font-bold px-1 py-0.5 rounded bg-[var(--color-surface-1)] border border-[var(--color-border)]">
                ↵
              </kbd>{" "}
              open
            </span>
            <span>
              <kbd className="font-mono font-bold px-1 py-0.5 rounded bg-[var(--color-surface-1)] border border-[var(--color-border)]">
                esc
              </kbd>{" "}
              close
            </span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl shadow-black/10 dark:shadow-black/30 overflow-hidden z-50">
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              No results for &ldquo;{query}&rdquo;
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Try different keywords or check for typos
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
