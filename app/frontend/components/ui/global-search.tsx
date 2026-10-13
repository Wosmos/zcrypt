"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useVaultSearch } from "@/components/ui/command-palette";
import { useVaultLockContext } from "@/components/providers/vault-lock-provider";
import { useFilesQuery } from "@/store/files";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useRecentlyViewedStore } from "@/store/recently-viewed";
import { Clock, Search, X } from "@/lib/icons";
import { cn, fileIconFor, formatBytes, formatRelativeTime } from "@/lib/utils";
import type { FileMetadata } from "@/types";

const MAX_RECENTS = 6;
const MAX_MATCHES = 8;
const VAULT_PATH = "/dashboard";

type Row = { file: FileMetadata; viewedAt?: number };

export function GlobalSearch({ className }: { className?: string }) {
  const t = useTranslations("ui.globalSearch");
  const router = useRouter();
  const pathname = usePathname();
  const onVault = pathname === VAULT_PATH;
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const vaultQuery = useVaultSearch((s) => s.query);
  const setVaultQuery = useVaultSearch((s) => s.setQuery);
  const requestOpen = useVaultSearch((s) => s.requestOpen);
  const [draft, setDraft] = useState("");
  const query = onVault ? vaultQuery : draft;
  const setQuery = onVault ? setVaultQuery : setDraft;

  const narrow = useIsMobile("(max-width: 639px)");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const unlocked = useVaultLockContext().unlocked;
  const files = useFilesQuery().data;
  const entries = useRecentlyViewedStore((s) => s.entries);

  const q = query.trim().toLowerCase();
  const rows = useMemo<Row[]>(() => {
    if (!unlocked || !files) return [];
    if (!q) {
      const byId = new Map(files.map((f) => [f.id, f]));
      return entries
        .flatMap((e): Row[] => {
          const file = byId.get(e.fileId);
          return file ? [{ file, viewedAt: e.viewedAt }] : [];
        })
        .slice(0, MAX_RECENTS);
    }
    return files
      .filter((f) => f.original_name.toLowerCase().includes(q))
      .slice(0, MAX_MATCHES)
      .map((file) => ({ file }));
  }, [unlocked, files, entries, q]);

  const showAll = q.length > 0 && !onVault;
  const optionCount = rows.length + (showAll ? 1 : 0);
  const panelOpen = open && (optionCount > 0 || q.length > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      )
        return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const close = () => {
    setOpen(false);
    inputRef.current?.blur();
  };

  const openFile = (file: FileMetadata) => {
    requestOpen(file.id);
    if (!onVault) {
      setDraft("");
      router.push(VAULT_PATH);
    }
    close();
  };

  const searchVault = () => {
    setVaultQuery(query);
    setDraft("");
    router.push(VAULT_PATH);
    close();
  };

  const choose = (i: number) => {
    if (i < rows.length) openFile(rows[i].file);
    else if (showAll) searchVault();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (query) setQuery("");
      else close();
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (!optionCount) return;
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : optionCount - 1)) % optionCount);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (panelOpen && optionCount) choose(Math.min(active, optionCount - 1));
      else if (!onVault && q) searchVault();
      else close();
    }
  };

  const optionId = (i: number) => `${listId}-opt-${i}`;

  return (
    <div
      ref={rootRef}
      className={cn("relative w-full min-w-0", className)}
      data-tour="vault-search"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div
        className={cn(
          "group flex h-11 items-center gap-2 rounded-2xl border bg-[var(--color-surface)] px-3 transition-[border-color,box-shadow] duration-200 sm:gap-3 sm:px-4",
          panelOpen
            ? "border-[var(--color-accent)]/50 shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-accent)_14%,transparent)]"
            : "border-[var(--color-border)] hover:border-[var(--color-border-hover)]",
        )}
      >
        <Search className="h-[18px] w-[18px] shrink-0 text-[var(--color-text-muted)] group-focus-within:text-[var(--color-accent)]" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={panelOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={panelOpen && optionCount ? optionId(active) : undefined}
          aria-label={t("placeholder")}
          placeholder={narrow ? t("placeholderShort") : t("placeholder")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent text-sm sm:text-[15px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label={t("clear")}
            className="rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="pointer-events-none hidden select-none rounded-md border border-[var(--color-border)] bg-[var(--color-surface-1)] px-1.5 py-0.5 font-mono text-[11px] leading-none text-[var(--color-text-muted)] sm:block">
            /
          </kbd>
        )}
      </div>

      {panelOpen ? (
        <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl shadow-black/30 animate-in fade-in-0 slide-in-from-top-1 duration-150">
          <p className="px-4 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
            {q ? t("files") : t("recents")}
          </p>
          <ul
            id={listId}
            role="listbox"
            aria-label={q ? t("files") : t("recents")}
            className="max-h-[min(24rem,60vh)] overflow-y-auto px-2 pb-2"
          >
            {rows.map((row, i) => {
              const Icon = fileIconFor(row.file.original_name);
              return (
                <li
                  key={row.file.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  onPointerMove={() => setActive(i)}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => choose(i)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2",
                    i === active && "bg-[var(--color-surface-1)]",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-1)] text-[var(--color-text-secondary)]">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--color-text)]">
                      {row.file.original_name}
                    </span>
                    <span className="block truncate text-xs text-[var(--color-text-muted)]">
                      {formatBytes(row.file.original_size)}
                      {row.viewedAt ? ` · ${formatRelativeTime(row.viewedAt)}` : null}
                    </span>
                  </span>
                  {row.viewedAt ? (
                    <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
                  ) : null}
                </li>
              );
            })}
            {q && rows.length === 0 ? (
              <li className="px-2.5 py-3 text-sm text-[var(--color-text-muted)]">
                {t("noMatches")}
              </li>
            ) : null}
            {showAll ? (
              <li
                id={optionId(rows.length)}
                role="option"
                aria-selected={active === rows.length}
                onPointerMove={() => setActive(rows.length)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={searchVault}
                className={cn(
                  "mt-1 flex cursor-pointer items-center gap-3 rounded-xl border-t border-[var(--color-border)] px-2.5 py-2.5 text-sm font-medium text-[var(--color-accent)]",
                  active === rows.length && "bg-[var(--color-surface-1)]",
                )}
              >
                <Search className="h-4 w-4" />
                <span className="truncate">{t("showAll", { query: query.trim() })}</span>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
