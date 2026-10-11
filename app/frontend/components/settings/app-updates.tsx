"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SettingGroup } from "@/components/settings/settings-primitives";
import {
  checkAndroidUpdate,
  checkForUpdates,
  installUpdate,
  openExternal,
  onUpdateProgress,
  type UpdateInfo,
  type UpdateProgress,
} from "@/lib/tauri";
import { toast } from "@/store/toast";
import { SITE_URL } from "@/lib/site";

type Phase = "idle" | "checking" | "installing";

const REINSTALL_NOTE_KEY = "zcrypt:android-reinstall-note-dismissed";

const noSubscription = () => () => {};

function readNoteDismissed() {
  try {
    return localStorage.getItem(REINSTALL_NOTE_KEY) === "1";
  } catch {
    return false;
  }
}

function formatMB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AppUpdates() {
  const t = useTranslations("settings.appUpdates");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [devBuild, setDevBuild] = useState<string | null>(null);
  const storedDismissed = useSyncExternalStore(noSubscription, readNoteDismissed, () => true);
  const [dismissedNow, setDismissedNow] = useState(false);
  const noteDismissed = storedDismissed || dismissedNow;

  const dismissNote = () => {
    setDismissedNow(true);
    try {
      localStorage.setItem(REINSTALL_NOTE_KEY, "1");
    } catch {}
  };

  const check = async () => {
    setPhase("checking");
    setCheckError(null);
    setDevBuild(null);
    try {
      const next = await checkForUpdates();
      if (next.channel === "android") {
        const android = await checkAndroidUpdate(next.current_version);
        setDevBuild(android.devBuild);
        setInfo({ ...next, available: android.available, version: android.latest });
      } else {
        setInfo(next);
      }
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhase("idle");
    }
  };

  // Check once when the panel opens, so the row is informative before the
  // user clicks anything.
  useEffect(() => {
    const id = setTimeout(() => void check(), 0);
    return () => clearTimeout(id);
  }, []);

  const downloadAndroid = async () => {
    try {
      await openExternal(`${SITE_URL}/dl/android`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("openFailed"));
    }
  };

  const install = async () => {
    setPhase("installing");
    setProgress(null);
    const unlisten = await onUpdateProgress(setProgress);
    try {
      // On success the app relaunches and this promise never settles.
      await installUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("updateFailed"));
      setPhase("idle");
    } finally {
      unlisten();
    }
  };

  // A .deb/.rpm install manages its own updates via the system package
  // manager: the in-app updater only knows how to replace a running
  // AppImage, so there's nothing meaningful to check or install here.
  const isAndroid = info?.channel === "android";

  if (info && !info.updatable && !info.channel) {
    return (
      <SettingGroup label={t("label")}>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm font-medium text-[var(--color-text)]">
            zcrypt v{info.current_version}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
            {t.rich("nativePackage", {
              url: SITE_URL.replace(/^https?:\/\//, ""),
              link: (chunks) => (
                <a
                  href={`${SITE_URL}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-cyan-600 underline-offset-2 hover:underline dark:text-cyan-400"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
      </SettingGroup>
    );
  }

  const status = (() => {
    if (phase === "checking") return t("checking");
    if (checkError) return t("checkFailed");
    if (!info) return "";
    if (info.channel === "ios") return t("fromAppStore");
    return info.available ? t("available", { version: info.version ?? "" }) : t("upToDate");
  })();

  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return (
    <SettingGroup label={t("label")} footnote={isAndroid ? t("footnoteAndroid") : t("footnote")}>
      <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text)]">
              zcrypt {info?.current_version ? `v${info.current_version}` : ""}
            </p>
            {devBuild && !info?.available && !checkError && (
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {t("devBuild", { build: devBuild, version: info?.version ?? "" })}
              </p>
            )}
            <p
              className={`mt-0.5 text-xs ${
                checkError
                  ? "text-[var(--toast-error)]"
                  : info?.available
                    ? "text-[var(--toast-success)]"
                    : "text-[var(--color-text-muted)]"
              }`}
            >
              {status}
            </p>
            {checkError && (
              <p className="mt-1 break-words text-xs text-[var(--color-text-muted)]">
                {checkError}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void check()} disabled={phase !== "idle"}>
              {phase === "checking" ? t("checkingShort") : t("checkAgain")}
            </Button>
            {info?.available && isAndroid && (
              <Button onClick={() => void downloadAndroid()} disabled={phase !== "idle"}>
                {t("downloadUpdate")}
              </Button>
            )}
            {info?.available && !isAndroid && (
              <Button onClick={() => void install()} disabled={phase !== "idle"}>
                {phase === "installing" ? t("installing") : t("installRestart")}
              </Button>
            )}
          </div>
        </div>

        {isAndroid && !noteDismissed && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3">
            <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
              {t.rich("reinstallNote", {
                b: (chunks) => (
                  <span className="font-medium text-[var(--color-text)]">{chunks}</span>
                ),
              })}
            </p>
            <button
              type="button"
              onClick={dismissNote}
              className="shrink-0 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              {t("gotIt")}
            </button>
          </div>
        )}

        {phase === "installing" && (
          <div className="space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-1)]">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-[width]"
                style={{ width: `${percent ?? 5}%` }}
              />
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              {progress
                ? progress.total
                  ? t("progressOf", {
                      done: formatMB(progress.downloaded),
                      total: formatMB(progress.total),
                    })
                  : t("progressDone", { done: formatMB(progress.downloaded) })
                : t("starting")}
            </p>
          </div>
        )}

        {info?.available && info.notes && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3">
            <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">
              {t("whatsNew")}
            </p>
            <p className="whitespace-pre-wrap text-xs text-[var(--color-text)]">{info.notes}</p>
          </div>
        )}
      </div>
    </SettingGroup>
  );
}
