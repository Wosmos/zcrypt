"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Plus, FolderAdd, FileUpload } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useTransferDockStore } from "@/store/transfer-dock";

/**
 * VaultFab — the single floating "+" action for the vault on mobile.
 *
 * Replaces the cramped New folder + Upload buttons: one accent FAB floating just
 * above the bottom nav that opens a small speed-dial ("Upload files" / "New
 * folder"). Mobile only (md:hidden) — desktop keeps the header buttons.
 */
interface VaultFabProps {
  onNewFolder: () => void;
  onUpload: () => void;
}

export function VaultFab({ onNewFolder, onUpload }: VaultFabProps) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  // Both this FAB and the transfers dock live bottom-right. When the dock is up,
  // hop above it (its baseline ≈ our 84px anchor, so clear its height + a gap)
  // rather than sitting on top of it. Falls back to the resting spot otherwise.
  const dockVisible = useTransferDockStore((s) => s.visible);
  const dockHeight = useTransferDockStore((s) => s.height);
  const bottom = dockVisible
    ? `calc(env(safe-area-inset-bottom, 8px) + ${92 + dockHeight}px)`
    : "calc(env(safe-area-inset-bottom, 8px) + 84px)";

  const actions = [
    { label: "Upload files", Icon: FileUpload, run: onUpload },
    { label: "New folder", Icon: FolderAdd, run: onNewFolder },
  ];

  const spring = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 500, damping: 30 };

  return (
    <div className="md:hidden">
      {/* Scrim — dims the vault while the menu is open; tap anywhere to dismiss. */}
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            aria-label="Close menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-black/30"
          />
        )}
      </AnimatePresence>

      {/* FAB + speed-dial, floating clear of the bottom nav. */}
      <div
        className="fixed right-5 z-50 flex flex-col items-end gap-3 [transition:bottom_0.28s_cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none"
        style={{ bottom }}
      >
        <AnimatePresence>
          {open &&
            actions.map((a, i) => (
              <motion.button
                key={a.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  a.run();
                }}
                initial={{ opacity: 0, y: 14, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 14, scale: 0.9 }}
                transition={{ ...spring, delay: reduce ? 0 : i * 0.04 }}
                className="flex items-center gap-3 appearance-none [-webkit-appearance:none] [-webkit-tap-highlight-color:transparent]"
              >
                <span className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] shadow-[0_6px_18px_-6px_rgba(0,0,0,0.35)]">
                  {a.label}
                </span>
                <span className="flex h-[52px] w-[52px] items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-[0_6px_18px_-6px_rgba(0,0,0,0.35)]">
                  <a.Icon className="h-6 w-6" />
                </span>
              </motion.button>
            ))}
        </AnimatePresence>

        <motion.button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close actions" : "Add to vault"}
          aria-expanded={open}
          className={cn(
            // Squircle (not rounded-full, which corner-shape forces back to a
            // circle). Rotating the whole button would skew the squircle into a
            // diamond, so only the "+" glyph rotates (below).
            "flex h-14 w-14 items-center justify-center rounded-3xl bg-[var(--color-accent)] text-white",
            // iOS Safari paints its own inset/gradient chrome on <button> and a
            // grey tap flash — both shrink the FAB visually. Reset them so it
            // renders as the full-size accent squircle everywhere.
            "appearance-none [-webkit-appearance:none] [-webkit-tap-highlight-color:transparent]",
            "shadow-[0_12px_30px_-6px_rgba(0,0,0,0.45)] transition-transform active:scale-95",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]"
          )}
        >
          <motion.span className="flex" animate={{ rotate: open ? 45 : 0 }} transition={spring}>
            <Plus className="h-7 w-7" />
          </motion.span>
        </motion.button>
      </div>
    </div>
  );
}
