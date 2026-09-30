"use client";

import { useEffect, useRef, useState } from "react";
import { TelegramIcon } from "@/components/icons/telegram";
import { CheckCircle2, ChevronDown, Upload } from "@/lib/icons";
import { cn, formatBytes } from "@/lib/utils";
import { useDrive } from "./drive-store";

/** The app's Transfers panel, replaying one upload to Telegram. */
export function TransfersDock({ variant }: { variant: "desktop" | "sheet" }) {
  const { state } = useDrive();
  const { upload, uploadItem, uploadAt, uploadMs } = state;
  const fill = useRef<HTMLElement>(null);
  const [pct, setPct] = useState(0);
  const [hold, setHold] = useState(false);

  useEffect(() => {
    const el = fill.current;
    if (upload !== "running" || !el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now = performance.now();
    const delay = Math.max(0, uploadAt - now);
    const played = Math.max(0, now - uploadAt);
    const anim = el.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
      duration: uploadMs,
      delay,
      easing: "cubic-bezier(0.4, 0, 0.6, 1)",
      fill: "both",
    });
    if (played) anim.currentTime = Math.min(played, uploadMs);
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - uploadAt) / uploadMs));
      setPct(Math.min(99, Math.round(p * 100)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    if (!reduce) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      anim.cancel();
      setPct(0);
    };
  }, [upload, uploadAt, uploadMs]);

  useEffect(() => {
    if (variant !== "sheet" || upload !== "done" || !uploadAt) return;
    setHold(true);
    const t = window.setTimeout(() => setHold(false), 1600);
    return () => window.clearTimeout(t);
  }, [variant, upload, uploadAt]);

  const running = upload === "running";
  const shown = variant === "desktop" ? upload !== "idle" : running || hold;

  return (
    <div
      className={cn("zh-dock", variant === "sheet" ? "zh-dock-sheet" : "zh-dock-desk")}
      data-state={running ? "active" : "done"}
      data-shown={shown || undefined}
      aria-hidden="true"
    >
      <div className="zh-dk-head">
        <span className="zh-dk-hic">
          {running ? <span className="zh-spin" /> : <CheckCircle2 className="zh-dk-ok" />}
        </span>
        <div className="zh-dk-ht">
          <p className="zh-dk-title">Transfers</p>
          <p className="zh-dk-sub">{running ? "1 uploading" : "All done"}</p>
        </div>
        <span className="zh-dk-chev">
          <ChevronDown className="h-4 w-4" />
        </span>
      </div>
      <div className="zh-dk-body">
        <div className="zh-dk-row">
          <span className="zh-dk-g">
            {running ? (
              <Upload className="zh-dk-up" />
            ) : (
              <CheckCircle2 key={uploadAt} className="zh-dk-done" />
            )}
          </span>
          <div className="zh-dk-mid">
            <div className="zh-dk-line">
              <p className="zh-dk-name">{uploadItem.name}</p>
              <span className="zh-dk-meta">
                <span>{formatBytes(uploadItem.size)}</span>
                {running ? <span>{pct}%</span> : null}
              </span>
            </div>
            <div className="zh-dk-bar">
              <i ref={fill} className="zh-dk-fill" />
            </div>
            <p className="zh-dk-st">
              <span className={cn(!running && "zh-dk-saved")}>
                {running ? "Uploading..." : "Saved"}
              </span>
              <span className="zh-pchip">
                <TelegramIcon className="zh-pchip-ic" />
                Telegram
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
