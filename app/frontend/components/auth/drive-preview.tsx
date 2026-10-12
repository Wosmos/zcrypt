"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { DocTile, FolderTile, ThumbTile } from "@/components/files/tiles/tiles";
import { PreviewArt } from "@/components/marketing/landing/drive/preview-art";
import type { ArtKey } from "@/components/marketing/landing/drive/drive-data";
import { Lock } from "@/lib/icons";
import { fileIconFor, getFileTypeInfo } from "@/lib/utils";

type Item =
  | { kind: "folder"; name: string; tint?: string }
  | { kind: "photo"; name: string; art: ArtKey }
  | { kind: "doc"; name: string };

const START: Item[] = [
  { kind: "folder", name: "Work" },
  { kind: "folder", name: "Family", tint: "#f59e0b" },
  { kind: "photo", name: "beach.jpg", art: "beach" },
  { kind: "doc", name: "tax-return.pdf" },
  { kind: "photo", name: "milo.jpg", art: "cat" },
  { kind: "doc", name: "budget.xlsx" },
  { kind: "photo", name: "sunset.jpg", art: "sunset" },
  { kind: "doc", name: "notes.md" },
];

const INCOMING: Item[] = [
  { kind: "photo", name: "wedding.jpg", art: "wedding" },
  { kind: "doc", name: "passport.pdf" },
  { kind: "photo", name: "party.jpg", art: "party" },
  { kind: "doc", name: "lease.docx" },
  { kind: "photo", name: "desk.jpg", art: "wallpaper" },
  { kind: "doc", name: "invoice.pdf" },
];

const CYCLE_MS = 4200;
const UPLOAD_MS = 1900;
const HEX = "0123456789abcdef";

function cipher(name: string, step: number): string {
  let out = "";
  for (let i = 0; i < Math.min(name.length, 14); i++) {
    out += HEX[(name.charCodeAt(i) * 7 + step * 13 + i * 5) % 16];
  }
  return out;
}

function Tile({ item }: { item: Item }) {
  if (item.kind === "folder") {
    return <FolderTile className="w-[64px]" initial={item.name[0]} color={item.tint} />;
  }
  if (item.kind === "photo") {
    return (
      <ThumbTile className="h-[46px] w-[62px]">
        <PreviewArt art={item.art} />
      </ThumbTile>
    );
  }
  return (
    <DocTile
      Icon={fileIconFor(item.name)}
      ext={item.name.split(".").pop()?.toUpperCase()}
      colorClass={getFileTypeInfo(item.name).color}
      className="origin-bottom scale-[0.6]"
    />
  );
}

/** Uploads one file at a time: an upload row fills while the name scrambles,
 *  then the file lands at the front of the grid with its lock. */
function useUploads(reduce: boolean | null) {
  const [items, setItems] = useState(START);
  const [uploading, setUploading] = useState<Item | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const next = useRef(0);

  useEffect(() => {
    if (reduce) return;
    let landTimer = 0;
    const tick = () => {
      const item = INCOMING[next.current % INCOMING.length];
      next.current += 1;
      setUploading(item);
      landTimer = window.setTimeout(() => {
        setUploading(null);
        setFresh(item.name);
        setItems((list) => [item, ...list.filter((i) => i.name !== item.name)].slice(0, 8));
      }, UPLOAD_MS);
    };
    const first = window.setTimeout(tick, 1200);
    const loop = window.setInterval(tick, CYCLE_MS);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(landTimer);
      window.clearInterval(loop);
    };
  }, [reduce]);

  return { items, uploading, fresh };
}

function UploadRow({ item }: { item: Item }) {
  const t = useTranslations("auth.panel");
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((s) => s + 1), 70);
    return () => window.clearInterval(id);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden"
    >
      <div className="mx-4 mt-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="truncate text-white/80">
            {t("encrypting")} <span className="text-white">{item.name}</span>
          </span>
          <span className="shrink-0 font-mono text-cyan-300/80">{cipher(item.name, step)}</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-teal-300"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: UPLOAD_MS / 1000, ease: [0.4, 0, 0.2, 1] }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/** A miniature vault window that keeps receiving files: the drive you are
 *  signing in to, encrypting on this device. Tilts gently toward the pointer. */
export function DrivePreview() {
  const t = useTranslations("auth.panel");
  const reduce = useReducedMotion();
  const { items, uploading, fresh } = useUploads(reduce);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-6, 6]), {
    stiffness: 120,
    damping: 18,
  });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [5, -5]), {
    stiffness: 120,
    damping: 18,
  });

  return (
    <div
      className="[perspective:1200px]"
      onPointerMove={(e) => {
        if (reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width - 0.5);
        py.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
    >
      <motion.figure
        aria-hidden
        dir="ltr"
        style={{ rotateX, rotateY }}
        className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1118]/80 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-md"
      >
        <div className="flex items-center gap-1.5 border-b border-white/[0.07] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <span className="ms-3 text-xs font-medium text-white/60">My Vault</span>
        </div>
        <AnimatePresence initial={false}>
          {uploading && <UploadRow key={uploading.name} item={uploading} />}
        </AnimatePresence>
        <motion.ul layout className="grid grid-cols-4 gap-x-3 gap-y-4 px-5 pb-4 pt-5">
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((item) => (
              <motion.li
                key={item.name}
                layout
                initial={{ opacity: 0, scale: 0.6, y: -14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                className="relative flex flex-col items-center gap-2"
              >
                <div className="relative flex h-[56px] w-full items-end justify-center overflow-hidden">
                  <Tile item={item} />
                </div>
                {fresh === item.name && (
                  <motion.span
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 520, damping: 20, delay: 0.15 }}
                    className="absolute end-1 top-8 flex h-5 w-5 items-center justify-center rounded-full bg-cyan-400 text-zinc-950 shadow-[0_0_0_3px_#0b1118,0_0_14px_rgba(34,211,238,0.55)]"
                  >
                    <Lock className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </motion.span>
                )}
                <span className="max-w-full truncate text-[11px] text-white/70">{item.name}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
        <figcaption className="flex items-center gap-2 border-t border-white/[0.07] px-4 py-2.5 text-[11px] text-white/55">
          <Lock className="h-3 w-3 text-cyan-300" aria-hidden />
          {t("encrypted")}
        </figcaption>
      </motion.figure>
    </div>
  );
}
