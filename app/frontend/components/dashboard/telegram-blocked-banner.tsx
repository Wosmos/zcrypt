"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "@/lib/icons";
import { Banner } from "@/components/ui/banner";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { Platform, type PlatformId } from "@/lib/platforms";
import { probeTelegram } from "@/lib/telegram-reach";

const TELEGRAM: PlatformId = Platform.Telegram;
const DISMISS_KEY = "zcrypt:telegram-blocked-banner-dismissed-at";
const DISMISS_FOR_MS = 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

/**
 * Tells a user whose storage is their own Telegram that this network blocks
 * Telegram, which happens country-wide in some places and on some ISPs and
 * office networks. The check runs from the user's own browser, so it catches a
 * block wherever it comes from rather than guessing from a country list.
 */
export function TelegramBlockedBanner() {
  const t = useTranslations("app.telegramBlocked");
  const { statuses } = usePlatformHealth();
  const usesOwnTelegram = statuses.some(
    (s) => s.platform === TELEGRAM && s.connected && !s.is_global,
  );
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!usesOwnTelegram) return;
    let live = true;
    void probeTelegram().then((reach) => {
      if (live) setBlocked(reach === "blocked" && !dismissedRecently());
    });
    return () => {
      live = false;
    };
  }, [usesOwnTelegram]);

  const checkAgain = useCallback(async () => {
    setChecking(true);
    try {
      setBlocked((await probeTelegram(true)) === "blocked");
    } finally {
      setChecking(false);
    }
  }, []);

  const dismiss = () => {
    setBlocked(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // A dismissal that does not persist only means the banner returns next load.
    }
  };

  if (!usesOwnTelegram || !blocked) return null;

  return (
    <Banner
      kind="warning"
      icon={AlertTriangle}
      title={t("title")}
      body={t("body")}
      actions={[
        {
          label: checking ? t("checking") : t("checkAgain"),
          onClick: () => void checkAgain(),
          disabled: checking,
          variant: "outline",
          icon: <RefreshCw className="h-3.5 w-3.5" />,
        },
      ]}
      onDismiss={dismiss}
    />
  );
}
