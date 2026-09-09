"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SettingGroup } from "@/components/settings/settings-primitives";
import {
  checkForUpdates,
  installUpdate,
  onUpdateProgress,
  type UpdateInfo,
  type UpdateProgress,
} from "@/lib/tauri";
import { toast } from "@/store/toast";

type Phase = "idle" | "checking" | "installing";

function formatMB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AppUpdates() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  const check = async () => {
    setPhase("checking");
    setCheckError(null);
    try {
      setInfo(await checkForUpdates());
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

  const status = (() => {
    if (phase === "checking") return "Checking for updates…";
    if (checkError) return "Couldn't check for updates";
    if (!info) return "";
    return info.available ? `Version ${info.version} is available` : "You're on the latest version";
  })();

  const percent =
    progress?.total && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  return (
    <SettingGroup
      label="App updates"
      footnote="Updates are signed with zcrypt's release key and verified before install. Only builds signed with that key are ever accepted."
    >
      <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text)]">
              zcrypt {info?.current_version ? `v${info.current_version}` : ""}
            </p>
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
            {info?.available && (
              <Button onClick={() => void install()} disabled={phase !== "idle"}>
                {phase === "installing" ? "Installing…" : "Install & restart"}
              </Button>
            )}
          </div>
        </div>

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
