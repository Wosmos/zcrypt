"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Database, ArrowRight } from "@/lib/icons";
import { useQuota } from "@/hooks/useQuota";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Tells a user on shared storage that they are on shared storage, and that
 * connecting their own account removes the cap.
 *
 * Why this exists: zcrypt lets a brand new user upload immediately using a
 * shared global token, which is the best thing about the product and was
 * previously invisible. Nobody was told they were using it, that it is capped,
 * or that their own account is one click away and unlimited. Of the 8 people
 * who have ever stored a file, 6 were on shared storage and had no idea.
 *
 * Deliberately a banner and not a redirect or a modal. These users are working;
 * the correct interruption for "you could have more room" is a line they can
 * dismiss, not a wall. Dismissal lasts 24 hours, so it stays a nudge rather
 * than becoming wallpaper they stop seeing.
 */
const DISMISS_KEY = "zcrypt:shared-storage-banner-dismissed-at";
const DISMISS_FOR_MS = 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_FOR_MS;
  } catch {
    // Private windows and blocked site data throw here. Showing the banner is
    // the safer failure: worst case someone sees a dismissible line again.
    return false;
  }
}

export function SharedStorageBanner() {
  const { quota } = useQuota();
  // Start hidden and decide on the client. localStorage is not available during
  // SSR, so rendering it server-side would flash a banner the user dismissed.
  const [visible, setVisible] = useState(false);

  const onShared = Boolean(quota && !quota.has_personal_key && !quota.is_unlimited);

  useEffect(() => {
    if (!onShared) {
      setVisible(false);
      return;
    }
    setVisible(!dismissedRecently());
  }, [onShared]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Dismissal not persisting is survivable; it returns on next load.
    }
  };

  if (!quota) return null;

  const used = quota.used_bytes;
  const total = quota.quota_bytes;
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  // Past 80% the tone shifts from informational to "do something now".
  const nearlyFull = pct >= 80;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div
            className={cn(
              "mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3",
              nearlyFull
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-[var(--color-border)] bg-[var(--color-surface-1)]",
            )}
          >
            <Database
              className={cn(
                "h-4 w-4 shrink-0",
                nearlyFull ? "text-amber-500" : "text-[var(--color-text-muted)]",
              )}
            />

            <div className="min-w-0 flex-1">
              <p className="text-sm text-[var(--color-text)]">
                {nearlyFull
                  ? "Shared storage is nearly full."
                  : "You are using zcrypt's shared storage."}{" "}
                <span className="text-[var(--color-text-muted)]">
                  {formatBytes(used)} of {formatBytes(total)}.
                </span>
              </p>

              <div
                className="mt-2 h-1 w-full max-w-xs overflow-hidden rounded-full bg-[var(--color-surface-3)]"
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Shared storage used"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-500",
                    nearlyFull ? "bg-amber-500" : "bg-[var(--color-accent)]",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <Link
              href="/settings?tab=storage"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-on-accent)] transition-opacity hover:opacity-90"
            >
              Connect your own
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss for today"
              className="shrink-0 rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
