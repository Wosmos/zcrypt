"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, FileUpload, Filter, Lock, X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { FILTERS, FOLDERS, type FilterKey } from "./drive-data";
import { useDrive } from "./drive-store";

/** Keeps Tab and Shift+Tab cycling inside `list`. */
export function trapFocus(e: React.KeyboardEvent<HTMLElement>, list: HTMLElement[]) {
  if (e.key !== "Tab" || !list.length) return;
  const first = list[0];
  const last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function trap(e: React.KeyboardEvent<HTMLElement>, root: HTMLElement | null) {
  if (!root) return;
  trapFocus(
    e,
    Array.from(root.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])")),
  );
}

/** The app's "Unlock protected folder" dialog. Any password works here. */
export function UnlockDialog({ onDone }: { onDone: () => void }) {
  const { state, dispatch } = useDrive();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const subId = useId();
  const folder = FOLDERS.find((f) => f.id === state.dialog?.folderId);
  const timer = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 60);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(timer.current);
    };
  }, []);

  if (!folder) return null;

  const close = () => {
    dispatch({ type: "dialog", folderId: null });
    onDone();
  };

  return (
    <div
      className="zh-dlg-wrap"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <form
        ref={box}
        className="zh-dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subId}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
          trap(e, box.current);
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!value || busy) return;
          setBusy(true);
          timer.current = window.setTimeout(() => {
            dispatch({ type: "folder", id: folder.id });
            dispatch({ type: "announce", msg: `Opened ${folder.name}.` });
            onDone();
          }, 520);
        }}
      >
        <div className="zh-dlg-h">
          <span className="zh-dlg-ic">
            <Lock className="h-5 w-5" />
          </span>
          <div className="zh-dlg-ht">
            <div id={titleId} className="zh-dlg-t">
              Unlock protected folder
            </div>
            <p id={subId} className="zh-dlg-sub">
              Enter the password for “{folder.name}”
            </p>
          </div>
          <button type="button" className="zh-dlg-x" aria-label="Close" onClick={close}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <input
          ref={input}
          type="password"
          className="zh-dlg-in"
          placeholder="Folder password"
          aria-label="Folder password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <p className="zh-dlg-help">Any password works in this demo.</p>
        <div className="zh-dlg-a">
          <button type="button" className="zh-db2" onClick={close}>
            Cancel
          </button>
          <button type="submit" className="zh-db1" disabled={!value || busy}>
            {busy ? "Verifying..." : "Unlock"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** The bottom-centre toast that answers anything the replica cannot do. */
export function HintToast() {
  const { state } = useDrive();
  return (
    <div className="zh-toast-wrap" role="status" aria-live="polite">
      {state.hint ? (
        <p key={state.hint.n} className="zh-toast">
          {state.hint.msg}
        </p>
      ) : null}
    </div>
  );
}

export function DropOverlay() {
  return (
    <div className="zh-drop" aria-hidden="true">
      <div className="zh-drop-box">
        <FileUpload className="h-8 w-8" />
        <p>Drop files to upload</p>
      </div>
    </div>
  );
}

/** The explorer toolbar's filter menu. */
export function FilterMenu({ className }: { className?: string }) {
  const { state, dispatch } = useDrive();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) wrap.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [open]);

  const pick = (k: FilterKey | null) => {
    dispatch({ type: "filter", filter: k });
    setOpen(false);
    wrap.current?.querySelector<HTMLElement>(".zh-tool")?.focus();
  };

  return (
    <div
      ref={wrap}
      className={cn("zh-menu-wrap", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          wrap.current?.querySelector<HTMLElement>(".zh-tool")?.focus();
        }
        if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault();
          const items = Array.from(
            wrap.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [],
          );
          const i = items.indexOf(document.activeElement as HTMLElement);
          const n = items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
          n?.focus();
        }
      }}
    >
      <button
        type="button"
        className="zh-tool"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-on={state.filter ? "" : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <Filter className="h-3.5 w-3.5" />
        {state.filter ? FILTERS.find((f) => f.key === state.filter)?.label : "Filter"}
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label="Filter by type" className="zh-menu">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              role="menuitemradio"
              aria-checked={state.filter === f.key}
              className="zh-menu-it"
              onClick={() => pick(f.key)}
            >
              {f.label}
              {state.filter === f.key ? <Check className="h-3.5 w-3.5" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
