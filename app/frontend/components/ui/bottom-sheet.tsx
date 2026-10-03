"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence, useDragControls } from "motion/react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the sheet, read by screen readers only. */
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const dragControls = useDragControls();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                drag="y"
                dragControls={dragControls}
                dragConstraints={{ top: 0 }}
                dragElastic={0.2}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 100 || info.velocity.y > 500) {
                    onClose();
                  }
                }}
                className="fixed inset-x-0 bottom-0 z-[60] max-h-[60dvh] overflow-y-auto rounded-t-2xl bg-[var(--color-surface)] border-t border-[var(--color-border)] shadow-2xl focus:outline-none"
                style={{ paddingBottom: "var(--safe-bottom)" }}
              >
                <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>

                {/* Drag handle */}
                <div
                  className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => dragControls.start(e)}
                >
                  <div className="h-1 w-10 rounded-full bg-[var(--color-text-muted)]/30" />
                </div>

                {/* Content */}
                <div className="overflow-y-auto px-4 pb-4">{children}</div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
