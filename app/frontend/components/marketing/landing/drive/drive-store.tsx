"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  HINT,
  MB,
  PIECE,
  randHex,
  shard,
  type DroppedFile,
  type FilterKey,
  type View,
} from "./drive-data";

export type UploadItem = { name: string; size: number };
type PreviewRef = { id: string; from: "grid" | "recent" };

type DriveState = {
  view: View;
  folder: string | null;
  layout: "grid" | "list";
  selectMode: boolean;
  selected: ReadonlySet<string>;
  filter: FilterKey | null;
  query: string;
  dropped: DroppedFile | null;
  extra: boolean;
  preview: PreviewRef | null;
  dialog: { folderId: string } | null;
  hint: { msg: string; n: number } | null;
  upload: "idle" | "running" | "done";
  uploadItem: UploadItem;
  uploadAt: number;
  uploadMs: number;
  live: { msg: string; n: number } | null;
  introDone: boolean;
};

type DriveAction =
  | { type: "view"; view: View }
  | { type: "extra"; on: boolean }
  | { type: "folder"; id: string | null }
  | { type: "layout"; layout: "grid" | "list" }
  | { type: "selectMode" }
  | { type: "select"; id: string; additive: boolean }
  | { type: "clearSelection" }
  | { type: "filter"; filter: FilterKey | null }
  | { type: "query"; query: string }
  | { type: "preview"; preview: PreviewRef | null }
  | { type: "dialog"; folderId: string | null }
  | { type: "hint"; msg?: string }
  | { type: "hintClear" }
  | { type: "drop"; file: DroppedFile }
  | { type: "uploadStart"; item: UploadItem; ms: number; at: number; intro?: boolean }
  | { type: "uploadDone" }
  | { type: "announce"; msg: string };

const INTRO_ITEM: UploadItem = { name: "beach-2025.jpg", size: 3.1 * MB };

const EMPTY: ReadonlySet<string> = new Set();

function initial(reduce: boolean): DriveState {
  return {
    view: "you",
    folder: null,
    layout: "grid",
    selectMode: false,
    selected: EMPTY,
    filter: null,
    query: "",
    dropped: null,
    extra: false,
    preview: null,
    dialog: null,
    hint: null,
    upload: reduce ? "done" : "idle",
    uploadItem: INTRO_ITEM,
    uploadAt: 0,
    uploadMs: 1400,
    live: null,
    introDone: reduce,
  };
}

function reducer(s: DriveState, a: DriveAction): DriveState {
  switch (a.type) {
    case "view": {
      if (s.view === a.view) return s;
      const toGh = a.view === "gh";
      return {
        ...s,
        view: a.view,
        layout: toGh ? "grid" : s.layout,
        extra: toGh ? true : s.extra,
        selectMode: toGh ? false : s.selectMode,
        selected: toGh ? EMPTY : s.selected,
        preview: null,
        dialog: null,
        live: {
          msg: toGh
            ? "Showing what we see: locked pieces with random names."
            : "Showing your view.",
          n: (s.live?.n ?? 0) + 1,
        },
      };
    }
    case "extra":
      return { ...s, extra: a.on };
    case "folder":
      return { ...s, folder: a.id, selected: EMPTY, filter: null, query: "", dialog: null };
    case "layout":
      return { ...s, layout: a.layout };
    case "selectMode":
      return { ...s, selectMode: !s.selectMode, selected: s.selectMode ? EMPTY : s.selected };
    case "select": {
      const next = new Set(a.additive || s.selectMode ? s.selected : []);
      if (s.selected.has(a.id)) next.delete(a.id);
      else next.add(a.id);
      return { ...s, selected: next };
    }
    case "clearSelection":
      return s.selected.size ? { ...s, selected: EMPTY } : s;
    case "filter":
      return { ...s, filter: a.filter };
    case "query":
      return { ...s, query: a.query };
    case "preview":
      return { ...s, preview: a.preview };
    case "dialog":
      return { ...s, dialog: a.folderId ? { folderId: a.folderId } : null };
    case "hint":
      return { ...s, hint: { msg: a.msg ?? HINT, n: (s.hint?.n ?? 0) + 1 } };
    case "hintClear":
      return { ...s, hint: null };
    case "drop":
      return {
        ...s,
        dropped: a.file,
        folder: null,
        filter: null,
        query: "",
        selected: EMPTY,
        preview: null,
        dialog: null,
        introDone: true,
        extra: s.view === "gh" ? true : s.extra,
      };
    case "uploadStart":
      return {
        ...s,
        upload: "running",
        uploadItem: a.item,
        uploadAt: a.at,
        uploadMs: a.ms,
        introDone: true,
      };
    case "uploadDone":
      return {
        ...s,
        upload: "done",
        dropped: s.dropped?.fresh ? { ...s.dropped, fresh: false } : s.dropped,
      };
    case "announce":
      return { ...s, live: { msg: a.msg, n: (s.live?.n ?? 0) + 1 } };
  }
}

type Ctx = {
  state: DriveState;
  dispatch: Dispatch<DriveAction>;
  accept: (file: File) => void;
  startIntro: () => void;
  reduce: boolean;
};

const DriveCtx = createContext<Ctx | null>(null);

function prefersReduce() {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Shared state for whichever product frame is mounted (desktop window or phone). */
export function DriveProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, false, initial);
  const reduceRef = useRef(false);
  const timer = useRef(0);
  const urlRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    reduceRef.current = prefersReduce();
    setReduce(reduceRef.current);
    if (reduceRef.current) dispatch({ type: "uploadDone" });
  }, []);

  useEffect(() => {
    if (!state.hint) return;
    const t = window.setTimeout(() => dispatch({ type: "hintClear" }), 2400);
    return () => window.clearTimeout(t);
  }, [state.hint]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const run = useCallback((item: UploadItem, intro: boolean) => {
    window.clearTimeout(timer.current);
    if (reduceRef.current) {
      dispatch({ type: "uploadStart", item, ms: 0, at: performance.now() });
      dispatch({ type: "uploadDone" });
      return;
    }
    const ms = intro ? 1400 : 1200;
    const delay = intro ? 0 : 150;
    dispatch({ type: "uploadStart", item, ms, at: performance.now() + delay, intro });
    timer.current = window.setTimeout(() => dispatch({ type: "uploadDone" }), ms + delay);
  }, []);

  const startIntro = useCallback(() => {
    const s = stateRef.current;
    if (s.introDone || s.dropped) return;
    run(INTRO_ITEM, true);
  }, [run]);

  const accept = useCallback(
    (file: File) => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const isImg = /^image\/(png|jpe?g|gif|webp|avif)$/.test(file.type);
      const url = isImg ? URL.createObjectURL(file) : null;
      urlRef.current = url;
      const n = Math.max(1, Math.ceil(file.size / PIECE));
      const pieces = Array.from({ length: n }, () => shard(randHex()));
      const name = file.name || "untitled";
      const dropped: DroppedFile = {
        id: `drop-${Date.now().toString(36)}`,
        name,
        size: file.size,
        saved: 0,
        mod: "Just now",
        type: file.type,
        url,
        pieces,
        fresh: true,
      };
      dispatch({ type: "drop", file: dropped });
      run({ name, size: file.size }, false);
      dispatch({ type: "announce", msg: `Added ${name}. Saved to Telegram.` });
    },
    [run],
  );

  const value = useMemo(
    () => ({ state, dispatch, accept, startIntro, reduce }),
    [state, accept, startIntro, reduce],
  );

  return <DriveCtx.Provider value={value}>{children}</DriveCtx.Provider>;
}

export function useDrive(): Ctx {
  const ctx = useContext(DriveCtx);
  if (!ctx) throw new Error("useDrive must be used inside DriveProvider");
  return ctx;
}
