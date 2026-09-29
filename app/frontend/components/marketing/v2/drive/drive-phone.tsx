"use client";

import { LockKeyOpen } from "@phosphor-icons/react";
import { GitHubIcon } from "@/components/marketing/preview/platform-marks";
import { LogoIcon } from "@/components/ui/logo";
import { BarChart3, Bell, Layers, Plus, Shield, Trash2 } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { COMMIT, filterKeyOf, REPO, type FilterKey } from "./drive-data";
import { DriveCard, GhOnlyCard } from "./drive-card";
import { DropOverlay, HintToast, UnlockDialog } from "./drive-parts";
import { FilePreview } from "./file-preview";
import { TransfersDock } from "./transfers-dock";
import { useExplorer } from "./use-explorer";

const CHIP_ORDER: { key: FilterKey; label: string }[] = [
  { key: "image", label: "Image" },
  { key: "document", label: "Document" },
  { key: "video", label: "Video" },
  { key: "audio", label: "Audio" },
  { key: "archive", label: "Archive" },
];

const TABS = [
  { icon: Shield, label: "Vault", on: true },
  { icon: BarChart3, label: "Insights" },
  { icon: Layers, label: "Spaces" },
  { icon: Trash2, label: "Deleted Files" },
] as const;

/** The phone layout of the app, as it renders at 428x926 inside the iPhone frame. */
export function DrivePhone({ onPick }: { onPick: () => void }) {
  const x = useExplorer();
  const { state, dispatch, gh, cards, extras, entries } = x;
  const hint = () => dispatch({ type: "hint" });
  const counts = new Map<FilterKey, number>();
  for (const f of entries.files) {
    const k = filterKeyOf(f.name);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const chips = CHIP_ORDER.filter((c) => counts.has(c.key));
  const total = entries.folders.length + entries.files.length;
  const refocus = () =>
    requestAnimationFrame(() => {
      const el = x.opener.current;
      if (el?.isConnected) el.focus({ preventScroll: true });
      else x.gridRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    });

  return (
    <div className="zh-ph">
      <div className="zh-ph-top zh-dim">
        <LogoIcon size={28} />
        <span className="zh-ph-tr">
          <span className="zh-vlock zh-vlock-round" aria-label="Locked to this device" role="img">
            <LockKeyOpen className="h-5 w-5" aria-hidden="true" />
          </span>
          <button type="button" className="zh-bell" aria-label="Notifications" onClick={hint}>
            <Bell className="h-5 w-5" />
          </button>
          <button type="button" className="zh-avatar" aria-label="Account" onClick={hint}>
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
                My Vault
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
                  All<span className="zh-chip-n">{total}</span>
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
                    {c.label}
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
          ref={x.gridRef}
          className={cn("zh-grid zh-grid-ph", state.extra && "zh-grid-extra")}
          role="group"
          aria-label="Sample files"
        >
          {cards.map((c, i) =>
            c.hidden ? null : (
              <DriveCard
                key={c.item.id}
                item={c.item}
                kind={c.kind}
                index={i}
                piece={c.piece}
                isGh={gh}
                mine={c.mine}
                fresh={"fresh" in c.item && c.item.fresh}
                selected={state.selected.has(c.item.id)}
                selectMode={state.selectMode}
                onOpen={x.onOpen}
              />
            ),
          )}
          {extras.map((e, k) => (
            <GhOnlyCard
              key={e.id}
              id={e.id}
              piece={e.piece}
              more={e.more}
              index={k}
              isGh={gh}
              onOpen={x.onOpenPiece}
            />
          ))}
        </div>
      </div>

      <TransfersDock variant="sheet" />
      <button
        type="button"
        className="zh-fab"
        aria-label="Add a file"
        onClick={onPick}
        data-pick=""
      >
        <Plus className="h-7 w-7" strokeWidth={2} />
      </button>
      <nav className="zh-ph-nav zh-dim" aria-label="Sample app sections">
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
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      <DropOverlay />
      {state.dialog ? <UnlockDialog onDone={refocus} /> : null}
      {state.preview ? (
        <FilePreview
          files={x.previewList}
          index={x.previewIndex}
          onIndex={x.setPreviewIndex}
          onClose={x.closePreview}
          mode={state.view}
          toast={x.toast}
        />
      ) : null}
      <HintToast />
    </div>
  );
}
