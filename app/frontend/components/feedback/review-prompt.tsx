"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Star, X } from "@/lib/icons";
import {
  markReviewPrompted,
  recordSuccessfulUpload,
  shouldPromptForReview,
} from "@/lib/review-prompt";
import { useAuthStore } from "@/store/auth";
import { useUploadStore } from "@/store/upload";
import { ReviewDialog } from "./review-dialog";

const SHOW_DELAY_MS = 4000;

export function ReviewPrompt() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const createdAt = user?.created_at;
  const [visible, setVisible] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const counted = useRef(new Set<string>());

  useEffect(() => {
    if (!userId) return;
    return useUploadStore.subscribe((state) => {
      for (const item of state.queue) {
        if (item.status !== "done" || counted.current.has(item.id)) continue;
        counted.current.add(item.id);
        recordSuccessfulUpload(userId);
      }
    });
  }, [userId]);

  useEffect(() => {
    if (!userId || !shouldPromptForReview(userId, createdAt)) return;
    const t = setTimeout(() => {
      const busy = useUploadStore
        .getState()
        .queue.some((i) => i.status !== "done" && i.status !== "failed" && i.status !== "paused");
      if (busy || !shouldPromptForReview(userId, createdAt)) return;
      markReviewPrompted(userId);
      setVisible(true);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [userId, createdAt]);

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.aside
            role="complementary"
            aria-label="Rate zcrypt"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-[calc(6.5rem+var(--safe-bottom))] left-3 right-3 z-40 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg sm:left-auto sm:right-6 sm:w-80 md:bottom-6"
          >
            <button
              type="button"
              onClick={() => setVisible(false)}
              aria-label="Dismiss"
              className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center gap-2 pr-8">
              <Star className="h-4 w-4 text-[var(--color-accent)]" />
              <p className="text-sm font-semibold text-[var(--color-text)]">Enjoying zcrypt?</p>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
              A sentence or two helps more than you would think. It takes under a minute.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setVisible(false);
                  setDialogOpen(true);
                }}
              >
                Rate zcrypt
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setVisible(false)}>
                Not now
              </Button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      <ReviewDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
