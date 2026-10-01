"use client";

import { useEffect, useState } from "react";
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
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [devBuild, setDevBuild] = useState<string | null>(null);
  const [noteDismissed, setNoteDismissed] = useState(true);

  useEffect(() => {
    setNoteDismissed(readNoteDismissed());
  }, []);

  const dismissNote = () => {
    setNoteDismissed(true);
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
    void check();
  }, []);

  const downloadAndroid = async () => {
    try {
      await openExternal(`${SITE_URL}/dl/android`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open the download");
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
      toast.error(err instanceof Error ? err.message : "Update failed");
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
      <SettingGroup label="App updates">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm font-medium text-[var(--color-text)]">
            zcrypt v{info.current_version}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
            This build doesn&apos;t check for updates automatically. It was installed as a native
            Linux package, which manages updates through your system&apos;s package manager instead.
            Get new releases from{" "}
            <a
              href={`${SITE_URL}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-cyan-600 underline-offset-2 hover:underline dark:text-cyan-400"
            >
              {SITE_URL.replace(/^https?:\/\//, "")}/download
            </a>
            .
          </p>
        </div>
      </SettingGroup>
    );
  }

  const status = (() => {
    if (phase === "checking") return "Checking for updates…";
    if (checkError) return "Couldn't check for updates";
    if (!info) return "";
    if (info.channel === "ios") return "Updates come from the App Store";
    return info.available ? `Version ${info.version} is available` : "You're on the latest version";
  })();

  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return (
    <SettingGroup
      label="App updates"
      footnote={
        isAndroid
          ? "Android updates download as a signed APK. Open it to install over this copy; your vault stays in the cloud."
          : "Updates are signed with zcrypt's release key and verified before install. Only builds signed with that key are ever accepted."
      }
    >
      <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text)]">
              zcrypt {info?.current_version ? `v${info.current_version}` : ""}
            </p>
            {devBuild && !info?.available && !checkError && (
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                Development build ({devBuild}), ahead of v{info?.version}
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
              {phase === "checking" ? "Checking…" : "Check again"}
            </Button>
            {info?.available && isAndroid && (
              <Button onClick={() => void downloadAndroid()} disabled={phase !== "idle"}>
                Download update
              </Button>
            )}
            {info?.available && !isAndroid && (
              <Button onClick={() => void install()} disabled={phase !== "idle"}>
                {phase === "installing" ? "Installing…" : "Install & restart"}
              </Button>
            )}
          </div>
        </div>

        {isAndroid && !noteDismissed && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3">
            <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
              <span className="font-medium text-[var(--color-text)]">Installed before v0.1.7?</span>{" "}
              Older copies were signed with a different key, so Android will refuse the update with
              &quot;App not installed&quot;. Let pending uploads finish, uninstall zcrypt once, then
              install the download and sign back in. Every update after that installs in place.
            </p>
            <button
              type="button"
              onClick={dismissNote}
              className="shrink-0 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Got it
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
                  ? `${formatMB(progress.downloaded)} of ${formatMB(progress.total)}`
                  : `${formatMB(progress.downloaded)} downloaded`
                : "Starting download…"}
            </p>
          </div>
        )}

        {info?.available && info.notes && (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3">
            <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">What's new</p>
            <p className="whitespace-pre-wrap text-xs text-[var(--color-text)]">{info.notes}</p>
          </div>
        )}
      </div>
    </SettingGroup>
  );
}
