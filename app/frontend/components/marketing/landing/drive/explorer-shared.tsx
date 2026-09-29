"use client";

import { DriveCard, GhOnlyCard } from "./drive-card";
import { DropOverlay, HintToast, UnlockDialog } from "./drive-parts";
import { FilePreview } from "./file-preview";
import type { useExplorer } from "./use-explorer";

type Explorer = ReturnType<typeof useExplorer>;

/** Returns focus to the card that opened a dialog, or the first card if it is gone. */
export function useRefocus(x: Explorer) {
  return () =>
    requestAnimationFrame(() => {
      const el = x.opener.current;
      if (el?.isConnected) el.focus({ preventScroll: true });
      else x.gridRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    });
}

/** The visible cards plus the locked-view-only extra pieces. */
export function ExplorerCards({ x }: { x: Explorer }) {
  const { state, gh, cards, extras } = x;
  return (
    <>
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
    </>
  );
}

/** Drop target, unlock dialog, file preview and hint toast shared by both frames. */
export function ExplorerOverlays({ x, onDone }: { x: Explorer; onDone: () => void }) {
  const { state } = x;
  return (
    <>
      <DropOverlay />
      {state.dialog ? <UnlockDialog onDone={onDone} /> : null}
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
    </>
  );
}
