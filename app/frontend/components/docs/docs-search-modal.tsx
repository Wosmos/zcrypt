"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { groupSlug, navSlug } from "@/components/docs/nav-keys";
import { docsNav } from "@/lib/data";
import { useClickOutside } from "@/hooks/useClickOutside";
import { Search, ArrowRight, FileText, X } from "@/lib/icons";
import { searchDocs, type SearchEntry } from "@/lib/docs-search-index";
import { cn } from "@/lib/utils";

function termsOf(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Starting points shown in the modal before the user types anything. */
const QUICK_LINKS: { href: string; section: string }[] = [
  { href: "/docs/getting-started", section: "Getting Started" },
  { href: "/docs/security", section: "Security" },
  { href: "/docs/connect-storage", section: "Getting Started" },
  { href: "/docs/self-hosting", section: "Developers" },
];

type Translate = (key: string) => string;

const DOC_ENTRIES = docsNav.flatMap((group) =>
  group.links.map((link) => ({ href: link.href, section: group.title })),
);

function localizeEntry(item: SearchEntry, t: Translate): SearchEntry {
  const doc = DOC_ENTRIES.find((d) => d.href === item.href && d.section === item.section);
  if (!doc) return item;
  const slug = navSlug(item.href);
  return {
    ...item,
    title: t(`docs.nav.${slug}.title`),
    content: t(`docs.nav.${slug}.desc`),
  };
}

function useLocalizedSearch(query: string, limit: number): SearchEntry[] {
  const t = useTranslations();
  return useMemo(() => {
    if (query.length < 2) return [];
    const tr: Translate = (key) => t(key as never);
    const base = searchDocs(query, limit).map((item) => localizeEntry(item, tr));
    const needle = query.trim().toLowerCase();
    const seen = new Set(base.map((r) => `${r.href}-${r.section}`));
    const extra: SearchEntry[] = [];
    for (const doc of DOC_ENTRIES) {
      if (seen.has(`${doc.href}-${doc.section}`)) continue;
      const slug = navSlug(doc.href);
      const title = tr(`docs.nav.${slug}.title`);
      const content = tr(`docs.nav.${slug}.desc`);
      if (title.toLowerCase().includes(needle) || content.toLowerCase().includes(needle)) {
        extra.push({ title, content, href: doc.href, section: doc.section, tags: [] });
      }
    }
    return [...base, ...extra].slice(0, limit);
  }, [query, limit, t]);
}

const sectionColors: Record<string, { text: string; bg: string }> = {
  Features: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  "Getting Started": { text: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-500/10" },
  "Organizing files": { text: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-500/10" },
  Security: { text: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10" },
  "Storage backends": { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  "Sharing & sending": { text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-500/10" },
  Transfers: { text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
  "Privacy tools": { text: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10" },
  Account: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  Apps: { text: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-500/10" },
  Developers: { text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
  Reference: { text: "text-[var(--color-text-secondary)]", bg: "bg-[var(--color-surface-1)]" },
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Highlight where a search term starts a word (word-boundary prefix), so
// "rust" highlights "Rust" in "Rust-powered" but not the middle of "trusted".
function highlightTerms(text: string, terms: string[]) {
  if (terms.length === 0) return text;
  const re = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}])(${terms.map(escapeRegExp).join("|")})`, "giu");
  const parts: { text: string; highlight: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), highlight: false });
    parts.push({ text: m[0], highlight: true });
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  if (last < text.length) parts.push({ text: text.slice(last), highlight: false });
  return (
    <>
      {parts.map((p, i) =>
        p.highlight ? (
          <mark key={i} className="rounded-sm bg-cyan-500/20 px-0.5 text-inherit">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

// ─── Shared result row ───────────────────────────────────────
function ResultRow({
  item,
  terms,
  active,
  onSelect,
  onHover,
}: {
  item: SearchEntry;
  terms: string[];
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const t = useTranslations();
  const colors = sectionColors[item.section] ?? sectionColors["Getting Started"];
  const sectionLabel =
    item.section === "Features"
      ? t("docs.ui.features")
      : t(`docs.navGroup.${groupSlug(item.section)}.title` as never);

  return (
    <button
      type="button"
      data-active={active || undefined}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-start transition-colors",
        active ? "bg-[var(--color-surface-1)]" : "hover:bg-[var(--color-surface-1)]",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              colors.bg,
              colors.text,
            )}
          >
            {sectionLabel}
          </span>
        </div>
        <p className="truncate text-sm font-semibold">{highlightTerms(item.title, terms)}</p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
          {highlightTerms(item.content, terms)}
        </p>
      </div>
      <ArrowRight
        className={cn(
          "mt-4 h-3.5 w-3.5 flex-shrink-0 transition-opacity",
          active ? "text-cyan-500 opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}

// ─── Shared footer hints ─────────────────────────────────────
function KeyHints() {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-3 border-t border-[var(--color-border)] px-3 py-2 text-[10px] text-[var(--color-text-muted)]">
      <span>
        <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1 py-0.5 font-mono font-bold">
          ↑↓
        </kbd>{" "}
        {t("docs.ui.hintNavigate")}
      </span>
      <span>
        <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1 py-0.5 font-mono font-bold">
          ↵
        </kbd>{" "}
        {t("docs.ui.hintOpen")}
      </span>
      <span>
        <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1 py-0.5 font-mono font-bold">
          esc
        </kbd>{" "}
        {t("docs.ui.hintClose")}
      </span>
    </div>
  );
}

// ─── Global search context (Cmd+K modal) ─────────────────────
export function DocsSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t = useTranslations();

  const results = useLocalizedSearch(query, 8);
  const terms = useMemo(() => termsOf(query), [query]);

  const showingQuickLinks = query.length < 2;
  // Flat list of navigable hrefs so arrow keys work over quick links too.
  const itemHrefs = showingQuickLinks ? QUICK_LINKS.map((l) => l.href) : results.map((r) => r.href);

  const go = useCallback(
    (href: string) => {
      onClose();
      setQuery("");
      router.push(href);
    },
    [onClose, router],
  );

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  // Focus on open; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const [prevResults, setPrevResults] = useState(results);
  if (prevResults !== results) {
    setPrevResults(results);
    setActiveIndex(0);
  }

  // Keep the active row visible.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-active]");
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Tab") {
      // Command palette: focus stays in the input, rows are driven by arrows.
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, itemHrefs.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (itemHrefs[activeIndex]) go(itemHrefs[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] transition-opacity duration-150",
        open ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      aria-hidden={!open}
      inert={!open}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("docs.ui.searchDocumentation")}
        onKeyDown={handleKeyDown}
        className={cn(
          "absolute left-1/2 top-[12vh] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl shadow-black/20 transition-transform duration-150 dark:shadow-black/50",
          open ? "scale-100" : "scale-[0.98]",
        )}
      >
        {/* Input row */}
        <div className="relative border-b border-[var(--color-border)]">
          <Search className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("docs.ui.searchPlaceholderShort")}
            aria-label={t("docs.ui.searchDocs")}
            className="w-full bg-transparent py-3.5 ps-11 pe-12 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("docs.ui.closeSearch")}
            className="absolute end-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Results / quick links / empty */}
        <div ref={listRef} className="max-h-[min(400px,55vh)] overflow-y-auto overscroll-contain">
          {showingQuickLinks ? (
            <div className="py-2">
              <p className="px-4 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                {t("docs.ui.startHere")}
              </p>
              {QUICK_LINKS.map((link, i) => {
                const colors = sectionColors[link.section] ?? sectionColors["Getting Started"];
                const active = i === activeIndex;
                return (
                  <button
                    key={link.href}
                    type="button"
                    data-active={active || undefined}
                    onClick={() => go(link.href)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors",
                      active ? "bg-[var(--color-surface-1)]" : "hover:bg-[var(--color-surface-1)]",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg",
                        colors.bg,
                      )}
                    >
                      <FileText className={cn("h-3.5 w-3.5", colors.text)} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {t(`docs.nav.${navSlug(link.href)}.title` as never)}
                      </span>
                      <span className="block truncate text-xs text-[var(--color-text-secondary)]">
                        {t(`docs.quick.${navSlug(link.href)}` as never)}
                      </span>
                    </span>
                    <ArrowRight
                      className={cn(
                        "h-3.5 w-3.5 flex-shrink-0 transition-opacity",
                        active ? "text-cyan-500 opacity-100" : "opacity-0",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          ) : results.length > 0 ? (
            results.map((item, i) => (
              <ResultRow
                key={`${item.href}-${item.title}`}
                item={item}
                terms={terms}
                active={i === activeIndex}
                onSelect={() => go(item.href)}
                onHover={() => setActiveIndex(i)}
              />
            ))
          ) : (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">
                {t("docs.ui.noResults", { query })}
              </p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {t("docs.ui.noResultsHint")}
              </p>
            </div>
          )}
        </div>

        <KeyHints />
      </div>
    </div>
  );
}

// ─── Inline search (docs index page) ─────────────────────────
export default function DocsSearch({ placeholder }: { placeholder?: string }) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const results = useLocalizedSearch(query, 8);
  const terms = useMemo(() => termsOf(query), [query]);

  const showResults = open && query.length >= 2 && results.length > 0;
  const showEmpty = open && query.length >= 2 && results.length === 0;

  const [prevResults, setPrevResults] = useState(results);
  if (prevResults !== results) {
    setPrevResults(results);
    setActiveIndex(0);
  }

  useClickOutside(containerRef, () => setOpen(false));

  // Keyboard shortcut: / to focus (Cmd+K opens the global modal instead).
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

  // Keep the active row visible while arrowing.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>("[data-active]");
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const navigate = useCallback(
    (entry: SearchEntry) => {
      setOpen(false);
      setQuery("");
      router.push(entry.href);
    },
    [router],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      navigate(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl mx-auto">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute start-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-muted)]" />
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
          placeholder={placeholder ?? t("docs.ui.searchPlaceholderShort")}
          className="w-full ps-11 pe-14 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
        />
        <kbd className="absolute end-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono font-bold text-[var(--color-text-muted)] bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-md">
          /
        </kbd>
      </div>

      {/* Results dropdown */}
      {showResults && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl shadow-black/10 dark:shadow-black/30 overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-[var(--color-border)]">
            <p className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
              {t("docs.ui.resultCount", { count: results.length })}
            </p>
          </div>
          <div ref={listRef} className="max-h-[360px] overflow-y-auto overscroll-contain">
            {results.map((item, i) => (
              <ResultRow
                key={`${item.href}-${item.title}`}
                item={item}
                terms={terms}
                active={i === activeIndex}
                onSelect={() => navigate(item)}
                onHover={() => setActiveIndex(i)}
              />
            ))}
          </div>
          <KeyHints />
        </div>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl shadow-black/10 dark:shadow-black/30 overflow-hidden z-50">
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              {t("docs.ui.noResults", { query })}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {t("docs.ui.noResultsHint")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
