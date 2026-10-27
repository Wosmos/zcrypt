"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { SettingGroup, ValueRow } from "@/components/settings/settings-primitives";
import { Bell, BellOff, Image, Info, Loader2, Send } from "@/lib/icons";
import {
  hostAppName,
  needsHomeScreenInstall,
  notifyPermission,
  requestNotifyPermission,
  sendTestNotification,
  type NotifyPermission,
} from "@/lib/notify";
import { usePreferencesStore } from "@/store/preferences";
import { toast } from "@/store/toast";

const SWITCH_CLASS =
  "data-[state=checked]:bg-[var(--color-accent)] data-[state=unchecked]:bg-[var(--color-surface-3)]";
const WRAP = "block whitespace-normal";
const BUTTON_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50 disabled:opacity-60";

/** Settings, Notifications: the operating system permission, a test, and photo previews. */
export function SystemNotificationSettings() {
  const t = useTranslations("settings.notifyPrefs");
  const thumbnails = usePreferencesStore((s) => s.notify.thumbnails);
  const setNotify = usePreferencesStore((s) => s.setNotify);
  const [permission, setPermission] = useState<NotifyPermission | null>(null);
  const [homeScreen, setHomeScreen] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    const read = () =>
      notifyPermission().then((p) => {
        if (!live) return;
        setHomeScreen(needsHomeScreenInstall());
        setPermission(p);
      });
    void read();
    const onVisible = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (homeScreen) {
    return (
      <p className="flex items-start gap-2 px-1 text-xs text-[var(--color-text-muted)]">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" />
        {t("iosHint")}
      </p>
    );
  }
  if (permission === null) return null;

  const turnOn = () => {
    void requestNotifyPermission().then(setPermission);
  };
  const test = async () => {
    setSending(true);
    const result = await sendTestNotification(t("testTitle"), t("testBody"));
    setSending(false);
    if (result === "shown" || result === "fallback") {
      toast.success(t("testSent"), { detail: t("testSentHint", { app: hostAppName() }) });
    } else if (result === "no-permission") {
      setPermission(await notifyPermission());
      toast.warning(t("state.denied"));
    } else {
      toast.error(t("testFailed"));
    }
  };
  const granted = permission === "granted";

  return (
    <SettingGroup label={t("group")}>
      <div>
        <ValueRow
          icon={granted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          title={t("title")}
          subtitle={<span className={WRAP}>{t(`state.${permission}`)}</span>}
        />
        {(granted || permission === "default") && (
          <div className="-mt-1 px-4 pb-3 ps-16">
            {granted ? (
              <button
                type="button"
                onClick={() => void test()}
                disabled={sending}
                className={BUTTON_CLASS}
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {t("test")}
              </button>
            ) : (
              <button type="button" onClick={turnOn} className={BUTTON_CLASS}>
                <Bell className="h-3.5 w-3.5" />
                {t("turnOn")}
              </button>
            )}
          </div>
        )}
      </div>
      {permission !== "unsupported" && (
        <ValueRow
          icon={<Image className="h-4 w-4" />}
          title={t("thumbnails")}
          subtitle={<span className={WRAP}>{t("thumbnailsDesc")}</span>}
          trailing={
            <Switch
              checked={thumbnails}
              onCheckedChange={(on) => setNotify({ thumbnails: on })}
              aria-label={t("thumbnails")}
              className={SWITCH_CLASS}
            />
          }
        />
      )}
    </SettingGroup>
  );
}
