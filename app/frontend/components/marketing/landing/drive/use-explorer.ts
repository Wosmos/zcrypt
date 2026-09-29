"use client";

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { formatBytes } from "@/lib/utils";
import {
  entriesFor,
  filterKeyOf,
  FOLDERS,
  fmtPiece,
  hashSeed,
  isDropped,
  PIECE,
  pieceFor,
  RECENT,
  type DriveFile,
  type DroppedFile,
  type Piece,
} from "./drive-data";
import type { CardItem, CardKind } from "./drive-card";
import { useDrive } from "./drive-store";
import type { PreviewFile } from "./preview-bodies";

const SPRING =
  "linear(0, 0.009, 0.035 2.1%, 0.141 4.4%, 0.723 12.9%, 0.938 16.7%, 1.017 20.3%, 1.043 24.4%, 1.035 28.2%, 1.007 38.8%, 0.998 48.3%, 1)";

export type Card = {
  item: CardItem;
  kind: CardKind;
  piece: Piece;
  mine: boolean;
  hidden: boolean;
};

export type Extra = { id: string; piece: Piece; more?: string };

function toPreview(f: DriveFile | DroppedFile): PreviewFile {
  return {
    id: f.id,
    name: f.name,
    size: f.size,
    art: f.art,
    seed: f.seed,
    pages: f.pages,
    duration: f.duration,
    url: isDropped(f) ? f.url : null,
    dropped: isDropped(f),
  };
}

function reduced() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Everything both frames share: the visible cards, click handling, preview lists, FLIP on drop. */
export function useExplorer() {
  const { state, dispatch } = useDrive();
  const { view, folder, dropped, filter, query, selectMode } = state;
  const gh = view === "gh";
  const opener = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const pos = useRef(new Map<string, { x: number; y: number }>());
  const lastDrop = useRef<string | null>(null);
  const lastFolder = useRef<string | null>(null);

  const entries = useMemo(() => entriesFor(folder, dropped), [folder, dropped]);

  const cards = useMemo<Card[]>(() => {
    const q = query.trim().toLowerCase();
    const base = folder ? 12 + (hashSeed(folder) % 997) : 0;
    let i = 0;
    const out: Card[] = [];
    for (const fo of entries.folders) {
      const hidden = !gh && (!!filter || (!!q && !fo.name.toLowerCase().includes(q)));
      out.push({
        item: fo,
        kind: "folder",
        piece: pieceFor(base + i++, fo.id),
        mine: false,
        hidden,
      });
    }
    for (const fi of entries.files) {
      const hidden =
        !gh &&
        ((!!filter && filterKeyOf(fi.name) !== filter) ||
          (!!q && !fi.name.toLowerCase().includes(q)));
      if (isDropped(fi)) {
        const n = fi.pieces.length;
        out.push({
          item: fi,
          kind: "file",
          piece: {
            name: fi.pieces[0],
            size: fmtPiece(Math.min(fi.size, PIECE)),
            cap: `your file, ${n} piece${n === 1 ? "" : "s"}`,
          },
          mine: true,
          hidden,
        });
      } else {
        out.push({
          item: fi,
          kind: "file",
          piece: pieceFor(base + i++, fi.id, fi.size),
          mine: false,
          hidden,
        });
      }
    }
    return out;
  }, [entries, filter, query, folder, gh]);

  const extras = useMemo<Extra[]>(() => {
    if (!dropped || folder) return [];
    const n = dropped.pieces.length;
    if (n < 2) return [];
    const out: Extra[] = dropped.pieces.slice(1, 6).map((name, k) => ({
      id: `x${k}`,
      piece: { name, size: k + 2 === n ? fmtPiece(dropped.size - PIECE * (n - 1)) : "10.0 MB" },
    }));
    if (n > 6) {
      out.push({
        id: "xmore",
        piece: { name: "", size: formatBytes(dropped.size - PIECE * 6) },
        more: `+ ${n - 6} more`,
      });
    }
    return out;
  }, [dropped, folder]);

  const recent = useMemo<(DriveFile | DroppedFile)[]>(
    () => (dropped ? [dropped, ...RECENT.slice(0, 3)] : RECENT),
    [dropped],
  );

  const visibleFiles = useMemo(
    () =>
      cards
        .filter((c) => c.kind === "file" && !c.hidden)
        .map((c) => c.item as DriveFile | DroppedFile),
    [cards],
  );

  const previewList = useMemo<PreviewFile[]>(() => {
    const p = state.preview;
    if (!p) return [];
    if (gh) {
      const list: PreviewFile[] = cards.map((c) => ({
        id: c.item.id,
        name: c.piece.name,
        size: PIECE,
        sizeLabel: c.piece.size,
      }));
      for (const x of extras) {
        if (!x.more)
          list.push({ id: x.id, name: x.piece.name, size: PIECE, sizeLabel: x.piece.size });
      }
      return list;
    }
    if (p.from === "recent") return recent.map(toPreview);
    return visibleFiles.map(toPreview);
  }, [state.preview, gh, cards, extras, recent, visibleFiles]);

  const previewIndex = Math.max(
    0,
    previewList.findIndex((f) => f.id === state.preview?.id),
  );

  const onOpen = useCallback(
    (item: CardItem, kind: CardKind, el: HTMLElement, e: React.MouseEvent) => {
      opener.current = el;
      if (gh) {
        dispatch({ type: "preview", preview: { id: item.id, from: "grid" } });
        return;
      }
      if (kind === "folder") {
        const fo = FOLDERS.find((f) => f.id === item.id);
        if (fo?.locked) dispatch({ type: "dialog", folderId: fo.id });
        else dispatch({ type: "folder", id: item.id });
        return;
      }
      if (selectMode || e.metaKey || e.ctrlKey || e.shiftKey) {
        dispatch({ type: "select", id: item.id, additive: e.metaKey || e.ctrlKey || e.shiftKey });
        return;
      }
      dispatch({ type: "clearSelection" });
      dispatch({ type: "preview", preview: { id: item.id, from: "grid" } });
      dispatch({ type: "announce", msg: `Opened ${item.name}.` });
    },
    [gh, selectMode, dispatch],
  );

  const onOpenPiece = useCallback(
    (piece: Piece, el: HTMLElement) => {
      opener.current = el;
      const x = extras.find((e) => e.piece.name === piece.name);
      if (x) dispatch({ type: "preview", preview: { id: x.id, from: "grid" } });
    },
    [extras, dispatch],
  );

  const openRecent = useCallback(
    (f: DriveFile | DroppedFile, el: HTMLElement) => {
      opener.current = el;
      dispatch({ type: "preview", preview: { id: f.id, from: "recent" } });
      dispatch({ type: "announce", msg: `Opened ${f.name}.` });
    },
    [dispatch],
  );

  const closePreview = useCallback(() => {
    dispatch({ type: "preview", preview: null });
    const el = opener.current;
    if (el?.isConnected) el.focus({ preventScroll: true });
  }, [dispatch]);

  const setPreviewIndex = useCallback(
    (i: number) => {
      const f = previewList[i];
      if (f && state.preview)
        dispatch({ type: "preview", preview: { id: f.id, from: state.preview.from } });
    },
    [previewList, state.preview, dispatch],
  );

  const toast = useCallback((msg: string) => dispatch({ type: "hint", msg }), [dispatch]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const els = Array.from(grid.querySelectorAll<HTMLElement>(":scope > [data-id]"));
    const dropId = dropped?.id ?? null;
    const isDrop = dropId !== lastDrop.current && !!dropId;
    const isFolder = folder !== lastFolder.current;
    lastDrop.current = dropId;
    lastFolder.current = folder;
    const motion = !reduced();
    if (motion && isFolder && !isDrop) {
      grid.animate(
        [
          { opacity: 0, transform: "translateY(4px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
      );
    }
    const prev = pos.current;
    const next = new Map<string, { x: number; y: number }>();
    for (const el of els) {
      const id = el.dataset.id ?? "";
      const p = { x: el.offsetLeft, y: el.offsetTop };
      next.set(id, p);
      if (!motion || !isDrop || el.offsetParent === null) continue;
      if (id === dropId) {
        el.animate(
          [
            { opacity: 0, transform: "scale(0.6)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 420, easing: SPRING },
        );
        continue;
      }
      const b = prev.get(id);
      if (!b) continue;
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      if (dx || dy) {
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: 280,
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        });
      }
    }
    pos.current = next;
  });

  return {
    state,
    dispatch,
    gh,
    entries,
    cards,
    extras,
    recent,
    previewList,
    previewIndex,
    onOpen,
    onOpenPiece,
    openRecent,
    closePreview,
    setPreviewIndex,
    toast,
    gridRef,
    opener,
  };
}
