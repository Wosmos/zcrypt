"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ScrollTrigger } from "@/components/marketing/landing/gsap";
import { ChevronLeft, ChevronRight, Download, FileText, Maximize, Minimize, X } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { kindOf, typeOf, type View } from "./drive-data";
import {
  AudioBody,
  DocBody,
  FallbackBody,
  HexBody,
  ImageBody,
  PdfBody,
  TextBody,
  VideoBody,
  type PreviewFile,
} from "./preview-bodies";

const EMPH = "cubic-bezier(0.05, 0.7, 0.1, 1)";
const EXIT = "cubic-bezier(0.3, 0, 0.8, 0.15)";
const DROPPED_LINE =
  "This is your file, and it stayed on your device. Sign up to open it right here.";

function focusables(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/** In-window replica of the app's file viewer, with sample bodies per file type. */
export function FilePreview({
  files,
  index,
  onIndex,
  onClose,
  mode,
  toast,
}: {
  files: PreviewFile[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  mode: View;
  toast: (msg: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [full, setFull] = useState(false);
  const [loading, setLoading] = useState(true);
  const closing = useRef(false);
  const file = files[index] ?? files[0];
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = ref.current;
    if (el) {
      const navBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const top = el.getBoundingClientRect().top;
      if (top < navBottom + 8) {
        const st = ScrollTrigger.getById("zh-grow");
        const target = window.scrollY + top - navBottom - 8;
        window.scrollTo({
          top: st && window.scrollY > st.end ? Math.max(st.end, target) : Math.max(0, target),
          behavior: "auto",
        });
      }
      el.animate(
        reduce.current
          ? [{ opacity: 0 }, { opacity: 1 }]
          : [
              { opacity: 0, transform: "scale(0.98)" },
              { opacity: 1, transform: "none" },
            ],
        { duration: reduce.current ? 120 : 300, easing: EMPH },
      );
    }
    closeBtn.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (reduce.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => setLoading(false), 350);
    return () => window.clearTimeout(t);
  }, [index]);

  const close = useCallback(() => {
    const el = ref.current;
    if (closing.current) return;
    closing.current = true;
    if (!el) return onClose();
    const a = el.animate(
      reduce.current
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 1, transform: "none" },
            { opacity: 0, transform: "scale(0.98)" },
          ],
      { duration: reduce.current ? 120 : 180, easing: EXIT, fill: "forwards" },
    );
    a.onfinish = () => onClose();
  }, [onClose]);

  const step = useCallback(
    (d: number) => {
      if (files.length < 2) return;
      onIndex((index + d + files.length) % files.length);
    },
    [files.length, index, onIndex],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    const tag = (e.target as HTMLElement).tagName;
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && tag !== "INPUT") {
      e.preventDefault();
      step(e.key === "ArrowRight" ? 1 : -1);
      return;
    }
    if (e.key === "Tab" && ref.current) {
      const list = focusables(ref.current);
      if (!list.length) return;
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
  };

  if (!file) return null;
  const gh = mode === "gh";
  const t = typeOf(file.name);
  const kind = gh ? "hex" : kindOf(file.name);

  let body: React.ReactNode;
  if (gh) body = <HexBody file={file} />;
  else if (kind === "image" && (file.url || file.art))
    body = <ImageBody key={file.id} file={file} />;
  else if (file.dropped) body = <FallbackBody file={file} toast={toast} line={DROPPED_LINE} />;
  else if (kind === "pdf") body = <PdfBody key={file.id} file={file} toast={toast} />;
  else if (kind === "docx") body = <DocBody />;
  else if (kind === "video") body = <VideoBody key={file.id} file={file} />;
  else if (kind === "audio") body = <AudioBody key={file.id} file={file} />;
  else if (kind === "text") body = <TextBody />;
  else body = <FallbackBody file={file} toast={toast} />;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="zh-pv"
      data-full={full || undefined}
      onKeyDown={onKeyDown}
    >
      <div className="zh-pv-head">
        <span className={cn("zh-pv-chip", gh ? "zh-pv-chip-gh" : [t.bg, t.color])}>
          <FileText className="h-4 w-4" />
        </span>
        <div className="zh-pv-ht">
          <div id={titleId} className={cn("zh-pv-name", gh && "font-mono")}>
            {file.name}
          </div>
          <div className="zh-pv-type">{gh ? "Binary" : t.label}</div>
        </div>
        {files.length > 1 ? (
          <span className="zh-pv-n">
            {index + 1} / {files.length}
          </span>
        ) : null}
        <div className="zh-pv-acts">
          <button
            type="button"
            className="zh-pv-ib"
            aria-label={full ? "Exit fullscreen" : "Fullscreen"}
            aria-pressed={full}
            onClick={() => setFull((v) => !v)}
          >
            {full ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
          <button
            type="button"
            className="zh-pv-ib"
            aria-label="Download"
            onClick={() => toast("Downloads work after you sign up.")}
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            ref={closeBtn}
            type="button"
            className="zh-pv-ib"
            aria-label="Close"
            onClick={close}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="zh-pv-main">
        {files.length > 1 ? (
          <>
            <button
              type="button"
              className="zh-pv-nav zh-pv-prev"
              aria-label="Previous"
              onClick={() => step(-1)}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="zh-pv-nav zh-pv-next"
              aria-label="Next"
              onClick={() => step(1)}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}
        <div className="zh-pv-body">
          {loading ? (
            <div className="zh-pv-load" role="status">
              <span className="zh-spin zh-spin-lg" aria-hidden="true" />
              <span className="zh-pv-load-t">Opening...</span>
              <span className="zh-pv-load-bar" aria-hidden="true">
                <i />
              </span>
            </div>
          ) : (
            body
          )}
        </div>
      </div>
    </div>
  );
}
