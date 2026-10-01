"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Search } from "@/lib/icons";
import { cn } from "@/lib/utils";

const DocsSearchModal = dynamic(
  () => import("@/components/docs/docs-search-modal").then((m) => m.DocsSearchModal),
  { ssr: false },
);

const DocsSearchContext = createContext<{ open: () => void }>({ open: () => {} });

export function useDocsSearch() {
  return useContext(DocsSearchContext);
}

/**
 * Mounts once in the docs layout: provides `useDocsSearch().open` to every
 * docs component (sidebar trigger, mobile bar), owns the Cmd+K / Ctrl+K
 * shortcut, and renders the command-palette modal.
 */
export function DocsSearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (open) setArmed(true);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openSearch = useCallback(() => setOpen(true), []);
  const value = useMemo(() => ({ open: openSearch }), [openSearch]);

  return (
    <DocsSearchContext.Provider value={value}>
      {children}
      {armed ? <DocsSearchModal open={open} onClose={() => setOpen(false)} /> : null}
    </DocsSearchContext.Provider>
  );
}

// ─── Search trigger (input-lookalike button) ─────────────────
export function DocsSearchTrigger({
  className,
  onBeforeOpen,
}: {
  className?: string;
  /** Runs before the modal opens, e.g. close the mobile drawer first. */
  onBeforeOpen?: () => void;
}) {
  const { open } = useDocsSearch();
  const [shortcut, setShortcut] = useState("⌘K");

  useEffect(() => {
    if (typeof navigator !== "undefined" && !/mac/i.test(navigator.userAgent)) {
      setShortcut("Ctrl K");
    }
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        onBeforeOpen?.();
        open();
      }}
      className={cn(
        "group flex w-full items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text-secondary)]",
        className,
      )}
    >
      <Search className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="min-w-0 flex-1 truncate text-left">Search docs…</span>
      <kbd className="flex-shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1.5 py-0.5 font-mono text-[10px] font-bold">
        {shortcut}
      </kbd>
    </button>
  );
}

// ─── Command-palette modal ───────────────────────────────────
