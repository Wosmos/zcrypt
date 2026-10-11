"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTour } from "@/components/onboarding/tour-provider";
import { getAppVersion } from "@/lib/tauri";
import {
  decideWhatsNew,
  markVersionSeen,
  readSeenVersion,
  resolveWhatsNewVersion,
} from "@/lib/whats-new";
import { useAuthStore } from "@/store/auth";
import { useWhatsNewStore } from "@/store/whats-new";

const WhatsNewDialog = dynamic(
  () => import("@/components/ui/whats-new-dialog").then((m) => m.WhatsNewDialog),
  { ssr: false },
);

const FIRST_DELAY_MS = 2500;
const RETRY_MS = 1500;

export function WhatsNewHost() {
  const userId = useAuthStore((s) => s.user?.id);
  const { isActive } = useTour();
  const { open, version, setOpen, init, markSeen } = useWhatsNewStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tryOpen = () => {
      if (cancelled) return;
      if (isActive()) {
        timer = setTimeout(tryOpen, RETRY_MS);
        return;
      }
      setOpen(true);
    };
    void getAppVersion()
      .catch(() => null)
      .then((app) => {
        if (cancelled) return;
        const current = resolveWhatsNewVersion(app);
        const seen = readSeenVersion(userId);
        const decision = decideWhatsNew(seen, current);
        if (decision === "first-visit") {
          markVersionSeen(userId, current);
          init(current, current);
          return;
        }
        init(current, seen);
        if (decision === "show") timer = setTimeout(tryOpen, FIRST_DELAY_MS);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId, isActive, init, setOpen]);

  useEffect(() => {
    if (!open || !userId || !version) return;
    queueMicrotask(() => setMounted(true));
    markVersionSeen(userId, version);
    markSeen();
  }, [open, userId, version, markSeen]);

  if (!mounted || !version) return null;
  return <WhatsNewDialog open={open} onOpenChange={setOpen} version={version} />;
}
