"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";

export function HoverReveal() {
  const t = useTranslations("site");
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div
      className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-64"
      onMouseEnter={() => {
        timerRef.current = setTimeout(() => setShow(true), 3000);
      }}
      onMouseLeave={() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setShow(false);
      }}
    >
      <AnimatePresence>
        {show && (
          <motion.p
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs text-[var(--color-text-muted)] text-center italic"
          >
            {t("home.hoverReveal")}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
