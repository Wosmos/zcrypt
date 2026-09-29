"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { gsap, MOTION_FULL, MOTION_REDUCE, useGSAP } from "@/components/marketing/landing/gsap";
import { useIsMobile } from "@/hooks/useIsMobile";
import { DriveDesktop } from "./drive-desktop";
import { DrivePhone } from "./drive-phone";
import { useDrive } from "./drive-store";
import { IPhoneFrame } from "./iphone-frame";
import { MacWindow } from "./mac-window";
import { ViewToggle } from "./view-toggle";

const HOLD = 0.72;

/** The pinned stage: the head above, and the product window that grows to fill the screen. */
export function DriveStage({
  head,
  section,
}: {
  head: ReactNode;
  section: RefObject<HTMLElement | null>;
}) {
  const { state, dispatch, accept, startIntro } = useDrive();
  const isPhone = useIsMobile("(max-width: 767px)");
  const [mounted, setMounted] = useState(false);
  const spacer = useRef<HTMLDivElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const introRef = useRef(startIntro);

  useEffect(() => {
    introRef.current = startIntro;
  }, [startIntro]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (state.view !== "you" || !state.extra) return;
    const t = window.setTimeout(() => dispatch({ type: "extra", on: false }), 420);
    return () => window.clearTimeout(t);
  }, [state.view, state.extra, dispatch]);

  useEffect(() => {
    const el = frame.current;
    if (!el || !mounted) return;
    const io = new IntersectionObserver(
      (list) => {
        if (list.some((e) => e.isIntersecting)) {
          io.disconnect();
          window.setTimeout(() => introRef.current(), 300);
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted, isPhone]);

  useEffect(() => {
    const root = section.current;
    if (!root) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      root.dataset.drag = "";
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) delete root.dataset.drag;
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      delete root.dataset.drag;
      const file = e.dataTransfer?.files?.[0];
      if (file) accept(file);
    };
    root.addEventListener("dragenter", enter);
    root.addEventListener("dragover", over);
    root.addEventListener("dragleave", leave);
    root.addEventListener("drop", drop);
    return () => {
      root.removeEventListener("dragenter", enter);
      root.removeEventListener("dragover", over);
      root.removeEventListener("dragleave", leave);
      root.removeEventListener("drop", drop);
    };
  }, [section, accept]);

  useGSAP(
    () => {
      const root = section.current;
      const p = pin.current;
      const fr = frame.current;
      const hd = p?.querySelector<HTMLElement>(".zh-head");
      if (!root || !p || !fr || !hd || !mounted) return;
      const mm = gsap.matchMedia();
      mm.add(
        {
          full: MOTION_FULL,
          reduce: MOTION_REDUCE,
          tall: "(min-height: 560px)",
          phone: "(max-width: 767px)",
        },
        (ctx) => {
          const { full, tall, phone } = ctx.conditions as Record<string, boolean>;
          if (!full || !tall) {
            root.dataset.expanded = "true";
            return () => {
              delete root.dataset.expanded;
            };
          }
          const y0 = () => hd.offsetTop + hd.offsetHeight + 40 - fr.offsetTop;
          const s0 = () => (phone ? 0.82 : Math.min(0.78, 1180 / Math.max(1, fr.offsetWidth)));
          const setVars = () => {
            fr.style.setProperty("--zh-y0", `${y0()}px`);
            fr.style.setProperty("--zh-s0", String(s0()));
          };
          setVars();
          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              id: "zh-grow",
              trigger: root,
              pin: p,
              pinSpacer: spacer.current ?? undefined,
              start: "top top",
              end: () => `+=${window.innerHeight * (phone ? 1 : 1.1)}`,
              scrub: 0.6,
              anticipatePin: 1,
              invalidateOnRefresh: true,
              refreshPriority: 2,
              onRefresh: setVars,
              onUpdate: (self) => {
                const on = self.progress >= HOLD;
                if (on && root.dataset.expanded !== "true") {
                  root.dataset.expanded = "true";
                  introRef.current();
                } else if (!on && root.dataset.expanded === "true") {
                  delete root.dataset.expanded;
                }
              },
            },
          });
          tl.fromTo(
            hd,
            { autoAlpha: 1, y: 0 },
            { autoAlpha: 0, y: -48, ease: "power1.in", duration: 0.4 },
            0,
          )
            .fromTo(
              fr,
              { y: () => y0(), scale: () => s0(), "--zh-lift": 1 },
              { y: 0, scale: 1, "--zh-lift": 0, ease: "power2.inOut", duration: HOLD },
              0,
            )
            .to({}, { duration: 1 - HOLD }, HOLD);

          const onFocus = () => {
            const st = tl.scrollTrigger;
            if (!st || st.progress >= HOLD) return;
            window.scrollTo({ top: st.start + (st.end - st.start) * 0.8, behavior: "auto" });
          };
          fr.addEventListener("focusin", onFocus);
          return () => {
            fr.removeEventListener("focusin", onFocus);
            delete root.dataset.expanded;
          };
        },
      );
    },
    { scope: section, dependencies: [mounted] },
  );

  const onPick = () => picker.current?.click();
  const setView = (v: "you" | "gh") => dispatch({ type: "view", view: v });

  return (
    <div ref={spacer} className="zh-pin-sp">
      <div ref={pin} className="zh-pin">
        {head}
        <a href="#how" className="zh-skip">
          Skip the app preview
        </a>
        <div ref={frame} className="zh-frame">
          <div className="zh-v-desk">
            <div className="zh-flipdock">
              <ViewToggle value={state.view} onChange={setView} size="lg" className="zh-tog-dock" />
            </div>
            <MacWindow title="zcrypt" toolbar={<span className="zh-win-pill">Sample files</span>}>
              <DriveDesktop onPick={onPick} />
            </MacWindow>
          </div>
          <div className="zh-v-ph zh-ph-group">
            <ViewToggle value={state.view} onChange={setView} size="lg" className="zh-tog-ph" />
            <IPhoneFrame>
              <DrivePhone onPick={onPick} />
            </IPhoneFrame>
          </div>
        </div>
        <input
          ref={picker}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) accept(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
