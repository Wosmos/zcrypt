"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, LifeBuoy } from "@/lib/icons";
import { Banner } from "@/components/ui/banner";
import { useRecoveryKit } from "@/hooks/useRecoveryKit";

const DISMISS_KEY = "zcrypt:recovery-kit-banner-dismissed-at";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

/** Nudges accounts without a recovery kit; dismissing hides it for 7 days. */
export function RecoveryKitBanner() {
  const t = useTranslations("settings.recoveryKit.banner");
  const { status } = useRecoveryKit();
  const [hidden, setHidden] = useState(dismissedRecently);

  if (!status || status.set || hidden) return null;

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
          href: "/settings?tab=security",
          variant: "outline",
          icon: <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" />,
        },
      ]}
      onDismiss={dismiss}
    />
  );
}
