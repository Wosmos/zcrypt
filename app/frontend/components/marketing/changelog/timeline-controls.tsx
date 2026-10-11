"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { CHANGE_KINDS, type ChangeKind } from "@/lib/changelog";
import { KIND_ICON, KIND_STYLES } from "@/components/changelog/release-groups";

type Filter = "all" | ChangeKind;

function items(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>("li[data-release]")).filter(
    (li) => li.offsetParent !== null,
  );
}

function sync(root: HTMLElement) {
  const line = window.innerHeight * 0.4;
  const rows = items(root);
  let active = -1;
  rows.forEach((li, i) => {
    if (li.getBoundingClientRect().top <= line) active = i;
  });
  if (active < 0 && rows.length) active = 0;
  rows.forEach((li, i) => {
    li.toggleAttribute("data-active", i === active);
    li.toggleAttribute("data-passed", i <= active);
  });
  const box = root.getBoundingClientRect();
  const end = rows.length ? rows[rows.length - 1].getBoundingClientRect().top - box.top + 24 : 0;
  const progress = Math.min(Math.max(line - box.top - 16, 0), Math.max(end, 0));
  root.style.setProperty("--cl-progress", `${progress}px`);
}

export function TimelineControls({ targetId }: { targetId: string }) {
  const t = useTranslations("changelog.page");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const root = document.getElementById(targetId);
    if (!root) return;
    let raf = 0;
    const run = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => sync(root));
    };
    run();
    window.addEventListener("scroll", run, { passive: true });
    window.addEventListener("resize", run);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", run);
      window.removeEventListener("resize", run);
    };
  }, [targetId]);

  useEffect(() => {
    const root = document.getElementById(targetId);
    if (!root) return;
    root.dataset.filter = filter;
    requestAnimationFrame(() => sync(root));
  }, [filter, targetId]);

  const pill =
    "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";

  return (
    <div
      role="group"
      aria-label={t("filterLabel")}
      className="cl-filter mb-10 flex flex-wrap items-center gap-2"
    >
      <button
        type="button"
        aria-pressed={filter === "all"}
        onClick={() => setFilter("all")}
        className={pill}
      >
        {t("filterAll")}
      </button>
      {CHANGE_KINDS.map((kind) => {
        const Icon = KIND_ICON[kind];
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={filter === kind}
            onClick={() => setFilter(filter === kind ? "all" : kind)}
            className={pill}
          >
            <Icon className={cn("h-3.5 w-3.5", KIND_STYLES[kind].icon)} />
            {t(`kinds.${kind}`)}
          </button>
        );
      })}
    </div>
  );
}
