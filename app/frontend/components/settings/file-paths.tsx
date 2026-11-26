"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePlatformStatusQuery } from "@/store/platform";
import { probeTelegram, type TelegramReach } from "@/lib/telegram-reach";
import { cachedPlatformCredentials } from "@/lib/platform-credentials";
import { Platform, platformName } from "@/lib/platforms";
import { CheckCircle2, Cpu, HardDrive, Key, Lock, Minus } from "@/lib/icons";
import { SettingGroup, ValueRow } from "@/components/settings/settings-primitives";

function Mark({ ok }: { ok: boolean | null }) {
  if (ok === null) return null;
  return ok ? (
    <CheckCircle2
      className="h-4 w-4"
      style={{ color: "var(--toast-success)" }}
      aria-hidden="true"
    />
  ) : (
    <Minus className="h-4 w-4 text-[var(--color-text-muted)]" aria-hidden="true" />
  );
}

/**
 * Settings → Storage: where encryption happens and which way this browser's
 * transfers go, so "zero-knowledge" and "straight to your storage" can be
 * checked rather than taken on trust.
 */
export function FilePaths() {
  const t = useTranslations("settings.filePaths");
  const { data: statuses } = usePlatformStatusQuery();
  const own = (statuses ?? []).filter((s) => s.connected && !s.is_global).map((s) => s.platform);
  const ownsTelegram = own.includes(Platform.Telegram);
  const [reach, setReach] = useState<TelegramReach | null>(null);
  const keyLoaded = cachedPlatformCredentials(Platform.Telegram) !== undefined;

  useEffect(() => {
    if (!ownsTelegram) return;
    let live = true;
    void probeTelegram().then((r) => {
      if (live) setReach(r);
    });
    return () => {
      live = false;
    };
  }, [ownsTelegram]);

  return (
    <SettingGroup label={t("title")} footnote={t("footnote")}>
      <ValueRow
        wrapSubtitle
        icon={<Cpu className="h-4 w-4" />}
        title={t("encryption")}
        subtitle={t("encryptionHere")}
        trailing={<Mark ok />}
      />
      <ValueRow
        wrapSubtitle
        icon={<HardDrive className="h-4 w-4" />}
        title={t("ownStorage")}
        subtitle={
          own.length > 0
            ? t("ownStorageYes", { names: own.map(platformName).join(", ") })
            : t("ownStorageNo")
        }
        trailing={<Mark ok={own.length > 0} />}
      />
      {ownsTelegram && (
        <ValueRow
          wrapSubtitle
          icon={<Lock className="h-4 w-4" />}
          title={t("telegram")}
          subtitle={
            reach === null
              ? t("telegramChecking")
              : reach === "ok"
                ? t("telegramReachable")
                : t("telegramBlocked")
          }
          trailing={<Mark ok={reach === null ? null : reach === "ok"} />}
        />
      )}
      {ownsTelegram && (
        <ValueRow
          wrapSubtitle
          icon={<Key className="h-4 w-4" />}
          title={t("key")}
          subtitle={keyLoaded ? t("keyLoaded") : t("keyNotLoaded")}
          trailing={<Mark ok={keyLoaded} />}
        />
      )}
    </SettingGroup>
  );
}
