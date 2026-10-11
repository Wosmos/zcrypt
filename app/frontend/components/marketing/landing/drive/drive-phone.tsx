"use client";

import { LockKeyOpen } from "@phosphor-icons/react";
import { GitHubIcon } from "@/components/icons/github";
import { MoreDotsIcon } from "@/components/icons/nav-icons";
import { LogoIcon } from "@/components/ui/logo";
import { BarChart3, Bell, Layers, Plus, Shield } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useDriveText } from "./drive-i18n";
import { COMMIT, filterKeyOf, REPO, type FilterKey } from "./drive-data";
import { TransfersDock } from "./transfers-dock";
import { ExplorerCards, ExplorerOverlays } from "./explorer-shared";
import { useExplorer } from "./use-explorer";

const CHIP_ORDER: { key: FilterKey }[] = [
  { key: "image" },
  { key: "document" },
  { key: "video" },
  { key: "audio" },
  { key: "archive" },
];

const TABS = [
  { icon: Shield, label: "vault", on: true },
  { icon: BarChart3, label: "insights" },
  { icon: Layers, label: "spaces" },
  { icon: MoreDotsIcon, label: "more" },
] as const;

/** The phone layout of the app, as it renders at 428x926 inside the iPhone frame. */
export function DrivePhone({ onPick }: { onPick: () => void }) {
  const [x, gridRef, refocus] = useExplorer();
  const { t } = useDriveText();
  const { state, dispatch, gh, entries } = x;
  const hint = () => dispatch({ type: "hint" });
  const counts = new Map<FilterKey, number>();
  for (const f of entries.files) {
    const k = filterKeyOf(f.name);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const chips = CHIP_ORDER.filter((c) => counts.has(c.key));
  const total = entries.folders.length + entries.files.length;

  return (
    <div className="zh-ph">
      <div className="zh-ph-top zh-dim">
        <LogoIcon size={28} />
        <span className="zh-ph-tr">
          <span
            className="zh-vlock zh-vlock-round"
            aria-label={t("drive.phone.lockedDevice")}
            role="img"
          >
            <LockKeyOpen className="h-5 w-5" aria-hidden="true" />
          </span>
          <button
            type="button"
            className="zh-bell"
            aria-label={t("drive.desktop.notifications")}
            onClick={hint}
          >
            <Bell className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="zh-avatar"
            aria-label={t("drive.desktop.account")}
            onClick={hint}
          >
            A
          </button>
        </span>
      </div>

      <div className="zh-ph-main">
        <div className="zh-swap zh-ph-bar">
          <div className="zh-sw zh-ph-chips" data-for="you" aria-hidden={gh || undefined}>
            {state.folder ? (
              <button
                type="button"
                className="zh-chip"
                onClick={() => dispatch({ type: "folder", id: null })}
              >
                {t("drive.desktop.myVault")}
              </button>
            ) : null}
            {chips.length > 1 || state.filter ? (
              <>
                <button
                  type="button"
                  className="zh-chip"
                  aria-pressed={!state.filter}
                  onClick={() => dispatch({ type: "filter", filter: null })}
                >
                  {t("drive.filters.all")}
                  <span className="zh-chip-n">{total}</span>
                </button>
                {chips.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className="zh-chip"
                    aria-pressed={state.filter === c.key}
                    onClick={() =>
                      dispatch({ type: "filter", filter: state.filter === c.key ? null : c.key })
                    }
                  >
                    {t(`drive.chips.${c.key}`)}
                    <span className="zh-chip-n">{counts.get(c.key)}</span>
                  </button>
                ))}
              </>
            ) : null}
          </div>
          <div className="zh-sw zh-repo zh-mono" data-for="gh" aria-hidden={!gh || undefined}>
            <GitHubIcon className="h-4 w-4" />
            <span>{REPO}</span>
            <span className="zh-repo-dim">{COMMIT.msg}</span>
          </div>
        </div>

        <div
          ref={gridRef}
          className={cn("zh-grid zh-grid-ph", state.extra && "zh-grid-extra")}
          role="group"
          aria-label={t("drive.desktop.sampleFiles")}
        >
          <ExplorerCards x={x} />
        </div>
      </div>

      <TransfersDock variant="sheet" />
      <button
        type="button"
        className="zh-fab"
        aria-label={t("drive.phone.addFile")}
        onClick={onPick}
        data-pick=""
      >
        <Plus className="h-7 w-7" strokeWidth={2} />
      </button>
      <nav className="zh-ph-nav zh-dim" aria-label={t("drive.desktop.sectionsAria")}>
        <div className="zh-ph-pill">
          {TABS.map(({ icon: I, label, ...r }) => (
            <button
              key={label}
              type="button"
              className="zh-pn"
              data-on={"on" in r || undefined}
              aria-current={"on" in r ? "page" : undefined}
              onClick={() => ("on" in r ? dispatch({ type: "folder", id: null }) : hint())}
            >
              <I className="h-[22px] w-[22px]" />
              <span>{t(`drive.nav.${label}`)}</span>
            </button>
          ))}
        </div>
      </nav>

      <ExplorerOverlays x={x} onDone={refocus} />
    </div>
  );
}
