"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SettingGroup, ValueRow } from "@/components/settings/settings-primitives";
import { clockTime } from "@/components/settings/folder-backup";
import { useVaultLockContext } from "@/components/providers/vault-lock-provider";
import { ensureUserKeypair } from "@/lib/keys";
import { toBase64 } from "@/lib/crypto";
import { listBackupFolders, photoBackupDisable, photoBackupEnable } from "@/lib/tauri";
import {
  openAppSettings,
  readPhotoBackup,
  requestPhotoAccess,
  runPhotoBackupNow,
  savePhotoBackup,
  type PhotoBackupSettings,
  type PhotoBackupState,
  type PhotoMode,
  type PhotoNetwork,
} from "@/lib/android-photo-backup";
import { Clock, Image as ImageIcon, RefreshCw, Shield, Wifi } from "@/lib/icons";
import { useKeysStore } from "@/store/keys";
import { toast } from "@/store/toast";

const FIELD =
  "h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10";

const ICON =
  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]";

function errorText(err: unknown, fallback: string): string {
  if (typeof err === "string" && err) return err;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function settingsOf(s: PhotoBackupState): PhotoBackupSettings {
  return { enabled: s.enabled, mode: s.mode, time: s.time, network: s.network };
}

/** A setting with its choices under the text, so nothing is cut off on a phone. */
function ChoiceRow({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <span className={ICON}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--color-text)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{subtitle}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  );
}

/** Android: back up the phone's photos and videos in the background. */
export function PhotoBackup() {
  const t = useTranslations("settings.photoBackup");
  const locale = useLocale();
  const vault = useVaultLockContext();
  const [state, setState] = useState<PhotoBackupState | null>(null);
  const [files, setFiles] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let gone = false;
    const refresh = () => {
      if (document.visibilityState === "visible") setState(readPhotoBackup());
    };
    document.addEventListener("visibilitychange", refresh);
    void Promise.resolve().then(() => {
      if (!gone) setState(readPhotoBackup());
    });
    listBackupFolders().then(
      (list) => {
        if (!gone) setFiles(list.reduce((n, f) => n + f.files, 0));
      },
      () => {},
    );
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  if (!state) return null;

  const update = (next: Partial<PhotoBackupSettings>) => {
    const merged = { ...settingsOf(state), ...next };
    savePhotoBackup(merged);
    setState({ ...state, ...merged });
  };

  const seal = async (passphrase: string) => {
    setBusy(true);
    try {
      await ensureUserKeypair(passphrase);
      const key = useKeysStore.getState().publicKey;
      if (!key) throw new Error(t("keyUnavailable"));
      const folders = await photoBackupEnable(toBase64(key));
      setFiles(folders.reduce((n, f) => n + f.files, 0));
      update({ enabled: true });
      toast.success(t("turnedOn"));
    } catch (err) {
      toast.error(errorText(err, t("turnOnFailed")));
    } finally {
      setBusy(false);
    }
  };

  const turnOn = async () => {
    const access = state.access === "none" ? await requestPhotoAccess() : state.access;
    setState((s) => (s ? { ...s, access } : s));
    if (access === "none") {
      toast.error(t("needsAccess"));
      return;
    }
    vault.withPassphrase((pp) => void seal(pp));
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await photoBackupDisable();
      update({ enabled: false });
      toast.success(t("turnedOff"));
    } catch (err) {
      toast.error(errorText(err, t("turnOffFailed")));
    } finally {
      setBusy(false);
    }
  };

  const networkDesc: Record<PhotoNetwork, string> = {
    wifi: t("wifiDesc"),
    mobile: t("mobileDesc"),
    any: t("anyDesc"),
  };

  return (
    <SettingGroup label={t("label")} footnote={t("footnote")}>
      <ValueRow
        icon={<ImageIcon className="h-4 w-4" />}
        title={t("title")}
        subtitle={
          state.enabled ? (files === null ? t("on") : t("status", { count: files })) : t("off")
        }
        trailing={
          <Switch
            aria-label={t("title")}
            checked={state.enabled}
            disabled={busy}
            onCheckedChange={(on) => void (on ? turnOn() : turnOff())}
          />
        }
      />
      {state.enabled && (
        <>
          {state.access !== "all" && (
            <ValueRow
              icon={<Shield className="h-4 w-4" />}
              title={state.access === "partial" ? t("partialTitle") : t("noAccessTitle")}
              subtitle={state.access === "partial" ? t("partialDesc") : t("noAccessDesc")}
              trailing={
                <Button variant="secondary" size="sm" onClick={openAppSettings}>
                  {t("allowAll")}
                </Button>
              }
            />
          )}
          <ChoiceRow
            icon={<Wifi className="h-4 w-4" />}
            title={t("networkTitle")}
            subtitle={networkDesc[state.network]}
          >
            <select
              aria-label={t("networkTitle")}
              value={state.network}
              onChange={(e) => update({ network: e.target.value as PhotoNetwork })}
              className={FIELD}
            >
              <option value="wifi">{t("wifi")}</option>
              <option value="mobile">{t("mobile")}</option>
              <option value="any">{t("any")}</option>
            </select>
          </ChoiceRow>
          <ChoiceRow
            icon={<Clock className="h-4 w-4" />}
            title={t("scheduleTitle")}
            subtitle={
              state.mode === "nightly"
                ? t("nightlyDesc", { time: clockTime(state.time, locale) })
                : t("instantDesc")
            }
          >
            <select
              aria-label={t("scheduleTitle")}
              value={state.mode}
              onChange={(e) => update({ mode: e.target.value as PhotoMode })}
              className={FIELD}
            >
              <option value="instant">{t("instant")}</option>
              <option value="nightly">{t("nightly")}</option>
            </select>
            {state.mode === "nightly" && (
              <input
                type="time"
                aria-label={t("timeLabel")}
                value={state.time}
                onChange={(e) => {
                  if (e.target.value) update({ time: e.target.value });
                }}
                className={FIELD}
              />
            )}
          </ChoiceRow>
          <ValueRow
            icon={<RefreshCw className="h-4 w-4" />}
            title={t("runNowTitle")}
            subtitle={networkDesc[state.network]}
            trailing={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  runPhotoBackupNow();
                  toast.success(t("runNowStarted"));
                }}
              >
                {t("runNow")}
              </Button>
            }
          />
        </>
      )}
    </SettingGroup>
  );
}
