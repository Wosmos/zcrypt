"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, LifeBuoy } from "@/lib/icons";
import { Banner } from "@/components/ui/banner";
import { useRecoveryKit } from "@/hooks/useRecoveryKit";
import { useAuthStore } from "@/store/auth";

const DISMISS_KEY = "zcrypt:recovery-kit-banner-dismissed-at";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;
const KNOWN_KEY = "zcrypt:recovery-kit-missing:";

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

function knownMissing(userId: string | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(KNOWN_KEY + userId) === "1";
  } catch {
    return false;
  }
}

function rememberMissing(userId: string, missing: boolean): void {
  try {
    if (missing) localStorage.setItem(KNOWN_KEY + userId, "1");
    else localStorage.removeItem(KNOWN_KEY + userId);
  } catch {
    /* the banner just waits for the next load that knows */
  }
}

/**
 * Nudges accounts without a recovery kit; dismissing hides it for 7 days. It
 * shows only when the page opens already knowing the kit is missing (from the
 * last visit), never popping in after the server answers, so the files below
 * never jump under the pointer.
 */
export function RecoveryKitBanner() {
  const t = useTranslations("settings.recoveryKit.banner");
  const { status } = useRecoveryKit();
  const userId = useAuthStore((s) => s.user?.id);
  const [hidden, setHidden] = useState(dismissedRecently);
  const [shownAtLoad] = useState(() => knownMissing(userId));

  useEffect(() => {
    if (userId && status) rememberMissing(userId, !status.set);
  }, [userId, status]);

  if (!shownAtLoad || status?.set || hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* the banner simply returns on the next load */
    }
  };

  return (
    <Banner
      kind="info"
      icon={LifeBuoy}
      title={t("title")}
      actions={[
        {
          label: t("action"),
          href: "/settings?tab=privacy",
          variant: "outline",
          icon: <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />,
        },
      ]}
      onDismiss={dismiss}
    />
  );
}
