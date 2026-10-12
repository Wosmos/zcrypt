"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LINES = 18;
const LINE_LEN = 72;
const LIVE_LINE = 7;
const NAMES = [
  "tax-return-2025.pdf",
  "passport-scan.jpg",
  "wedding-final-FINAL.mov",
  "therapy-notes.md",
  "salary-negotiation.docx",
];
const PLAIN_MS = 2_200;
const SEALED_MS = 1_600;
const SCRAMBLE_MS = 600;

/** Deterministic noise so the server render and the client match. */
function noise(seed: number, length: number): string {
  let h = seed >>> 0;
  let out = "";
  for (let i = 0; i < length; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9;
    h ^= h >>> 13;
    out += B64[(h >>> 0) % 64];
  }
  return out;
}

const WALL = Array.from({ length: LINES }, (_, i) => noise(i * 7919 + 17, LINE_LEN));

/** Text that scrambles through noise whenever it changes. */
function Scramble({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  const from = useRef(text);

  useEffect(() => {
    const start = from.current;
    if (start === text) return;
    const began = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - began) / SCRAMBLE_MS);
      const len = Math.round(start.length + (text.length - start.length) * p);
      const settled = Math.floor(len * p);
      setShown(text.slice(0, settled) + noise(Math.floor(now / 45), Math.max(0, len - settled)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = text;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = text;
    };
  }, [text]);

  return <>{shown}</>;
}

/**
 * The sign-in page's left panel: the vault as zcrypt's servers see it, a wall
 * of ciphertext. One line keeps surfacing a real-looking file name and sealing
 * it again, which is the whole product in one moment.
 */
export function CipherWall({ className }: { className?: string }) {
  const t = useTranslations("auth.showcase");
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [sealed, setSealed] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const id = setTimeout(
      () => {
        if (sealed) setIndex((i) => (i + 1) % NAMES.length);
        setSealed((s) => !s);
      },
      sealed ? SEALED_MS : PLAIN_MS,
    );
    return () => clearTimeout(id);
  }, [sealed, reduce]);

  const name = NAMES[index];
  const live = sealed ? noise(index * 131 + 7, name.length) : name;
  const pad = WALL[LIVE_LINE];
  const lead = 14;

  return (
    <figure className={cn("relative", className)}>
      <div
        aria-hidden
        className="select-none overflow-hidden font-mono text-[13px] leading-[1.7] tracking-[0.04em] text-white/[0.13] [mask-image:linear-gradient(to_bottom,transparent,#000_18%,#000_70%,transparent),linear-gradient(to_right,#000_55%,transparent)] [mask-composite:intersect]"
      >
        {WALL.map((line, i) =>
          i === LIVE_LINE ? (
            <div key={i} className="whitespace-nowrap">
              {pad.slice(0, lead)}
              <span
                className={cn(
                  "mx-1 rounded-[3px] px-1 transition-colors duration-500",
                  sealed
                    ? "text-white/[0.13]"
                    : "bg-cyan-400/[0.12] text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.25)]",
                )}
              >
                <Scramble text={live} />
              </span>
              {pad.slice(lead + name.length)}
            </div>
          ) : (
            <div key={i} className="whitespace-nowrap">
              {line}
            </div>
          ),
        )}
      </div>
      <figcaption className="mt-6 max-w-[22rem]">
        <p className="text-[15px] font-medium text-zinc-200">{t("caption")}</p>
        <p className="mt-1 text-sm text-zinc-500">{t("note")}</p>
      </figcaption>
    </figure>
  );
}
