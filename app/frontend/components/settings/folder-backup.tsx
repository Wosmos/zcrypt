"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { LinkRow, SettingGroup, ValueRow } from "@/components/settings/settings-primitives";
import { useVaultLockContext } from "@/components/providers/vault-lock-provider";
import { ensureUserKeypair } from "@/lib/keys";
import { toBase64 } from "@/lib/crypto";
import { SETTINGS_TAB_PARAM } from "@/lib/settings-tab";
import { formatRelativeTime } from "@/lib/utils";
import {
  addBackupFolder,
  getBackupSchedule,
  isAutostartEnabled,
  listBackupFolders,
  pickBackupFolder,
  removeBackupFolder,
  runBackupNow,
  setAutostart,
  setBackupSchedule,
  subscribeBackup,
  type BackupFolder,
  type BackupPass,
  type BackupSchedule,
} from "@/lib/tauri";
import { Clock, Folder, LifeBuoy, Moon, RefreshCw, UploadCloud } from "@/lib/icons";
import { useKeysStore } from "@/store/keys";
import { toast } from "@/store/toast";

/** SQLite's `datetime('now')` is UTC without a zone; WebKit can't parse it as is. */
export function scanTime(value: string): number | null {
  if (!value) return null;
  const ts = new Date(`${value.replace(" ", "T")}Z`).getTime();
  return Number.isNaN(ts) ? null : ts;
}

const FIELD =
  "h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10";

/** "02:00" as this locale writes a time of day. */
export function clockTime(value: string, locale: string): string {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return value;
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function errorText(err: unknown, fallback: string): string {
  if (typeof err === "string" && err) return err;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function FolderBackup() {
  const t = useTranslations("settings.folderBackup");
  const locale = useLocale();
  const vault = useVaultLockContext();
  const recoveryKit = useKeysStore((s) => s.recoveryKit);
  const [folders, setFolders] = useState<BackupFolder[] | null>(null);
  const [passes, setPasses] = useState<Record<string, BackupPass>>({});
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<BackupFolder | null>(null);
  const [removing, setRemoving] = useState(false);
  const [schedule, setSchedule] = useState<BackupSchedule | null>(null);
  const [background, setBackground] = useState<boolean | null>(null);
  const [askBackground, setAskBackground] = useState(false);

  useEffect(() => {
    let gone = false;
    let unlisten: (() => void) | null = null;
    const refresh = () =>
      listBackupFolders().then(
        (list) => {
          if (!gone) setFolders(list);
        },
        () => {
          if (!gone) setFolders([]);
        },
      );
    void refresh();
    getBackupSchedule().then(
      (s) => {
        if (!gone) setSchedule(s);
      },
      () => {},
    );
    isAutostartEnabled().then(
      (on) => {
        if (!gone) setBackground(on);
      },
      () => {},
    );
    void subscribeBackup((pass) => {
      setPasses((prev) => ({ ...prev, [pass.id]: pass }));
      void refresh();
    }).then((fn) => {
      if (gone) fn();
      else unlisten = fn;
    });
    return () => {
      gone = true;
      unlisten?.();
    };
  }, []);

  const seal = async (path: string, passphrase: string) => {
    setAdding(true);
    try {
      await ensureUserKeypair(passphrase);
      const key = useKeysStore.getState().publicKey;
      if (!key) throw new Error(t("keyUnavailable"));
      const added = await addBackupFolder(path, toBase64(key));
      setFolders((prev) => [...(prev ?? []).filter((f) => f.id !== added.id), added]);
      toast.success(t("added", { name: added.name }));
      if (background === false) setAskBackground(true);
    } catch (err) {
      toast.error(errorText(err, t("addFailed")));
    } finally {
      setAdding(false);
    }
  };

  const add = async () => {
    setAdding(true);
    let path: string | null = null;
    try {
      path = await pickBackupFolder(t("pickTitle"));
    } catch (err) {
      toast.error(errorText(err, t("addFailed")));
    }
    setAdding(false);
    if (!path) return;
    const picked = path;
    vault.withPassphrase((pp) => void seal(picked, pp));
  };

  const remove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await removeBackupFolder(removeTarget.id);
      setFolders((prev) => (prev ?? []).filter((f) => f.id !== removeTarget.id));
      toast.success(t("removed", { name: removeTarget.name }));
      setRemoveTarget(null);
    } catch (err) {
      toast.error(errorText(err, t("removeFailed")));
    } finally {
      setRemoving(false);
    }
  };

  const backUpNow = async () => {
    try {
      await runBackupNow();
      toast.success(t("started"));
    } catch (err) {
      toast.error(errorText(err, t("runFailed")));
    }
  };

  const changeSchedule = async (next: BackupSchedule, announce: boolean) => {
    const previous = schedule;
    setSchedule(next);
    try {
      await setBackupSchedule(next);
      if (announce) {
        toast.success(
          next.mode === "nightly"
            ? t("scheduleNightlySaved", { time: clockTime(next.time, locale) })
            : t("scheduleInstantSaved"),
        );
      }
    } catch (err) {
      setSchedule(previous);
      toast.error(errorText(err, t("scheduleFailed")));
    }
  };

  const changeBackground = async (on: boolean) => {
    setAskBackground(false);
    try {
      await setAutostart(on);
      setBackground(on);
      toast.success(on ? t("backgroundOn") : t("backgroundOff"));
    } catch (err) {
      toast.error(errorText(err, t("backgroundFailed")));
    }
  };

  const subtitle = (f: BackupFolder) => {
    if (!f.available) return t("missing");
    const pass = passes[f.id];
    if (pass && pass.failed > 0) return t("someFailed", { count: pass.failed });
    const at = scanTime(f.last_scan_at);
    if (at === null) return t("waiting");
    return t("status", { count: f.files, when: formatRelativeTime(at) });
  };

  const hasFolders = (folders?.length ?? 0) > 0;

  return (
    <div className="space-y-8">
      <SettingGroup label={t("label")} footnote={t("footnote")}>
        {folders?.map((f) => (
          <ValueRow
            key={f.id}
            icon={<Folder className="h-4 w-4" />}
            title={<span title={f.path}>{f.name || f.path}</span>}
            subtitle={subtitle(f)}
            trailing={
              <Button variant="ghost" size="sm" onClick={() => setRemoveTarget(f)}>
                {t("remove")}
              </Button>
            }
          />
        ))}
        {hasFolders && schedule && (
          <div className="flex gap-3 px-4 py-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]">
              <Clock className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--color-text)]">{t("scheduleTitle")}</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {schedule.mode === "nightly"
                  ? t("scheduleNightlyDesc", { time: clockTime(schedule.time, locale) })
                  : t("scheduleInstantDesc")}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <select
                  aria-label={t("scheduleTitle")}
                  value={schedule.mode}
                  onChange={(e) =>
                    void changeSchedule(
                      { ...schedule, mode: e.target.value === "nightly" ? "nightly" : "instant" },
                      true,
                    )
                  }
                  className={FIELD}
                >
                  <option value="instant">{t("scheduleInstant")}</option>
                  <option value="nightly">{t("scheduleNightly")}</option>
                </select>
                {schedule.mode === "nightly" && (
                  <input
                    type="time"
                    aria-label={t("scheduleTime")}
                    value={schedule.time}
                    onChange={(e) => {
                      if (e.target.value)
                        void changeSchedule({ ...schedule, time: e.target.value }, false);
                    }}
                    className={FIELD}
                  />
                )}
              </div>
            </div>
          </div>
        )}
        {hasFolders && background !== null && (
          <ValueRow
            icon={<Moon className="h-4 w-4" />}
            title={t("backgroundTitle")}
            subtitle={t("backgroundDesc")}
            trailing={
              <Switch
                aria-label={t("backgroundTitle")}
                checked={background}
                onCheckedChange={(on) => void changeBackground(on)}
              />
            }
          />
        )}
        {hasFolders && (
          <ValueRow
            icon={<RefreshCw className="h-4 w-4" />}
            title={t("runNowTitle")}
            subtitle={t("runNowDesc")}
            trailing={
              <Button variant="ghost" size="sm" onClick={() => void backUpNow()}>
                {t("runNow")}
              </Button>
            }
          />
        )}
        <ValueRow
          icon={<UploadCloud className="h-4 w-4" />}
          title={hasFolders ? t("addAnother") : t("addFirst")}
          subtitle={hasFolders ? undefined : t("addFirstDesc")}
          trailing={
            <Button
              variant="secondary"
              size="sm"
              disabled={folders === null || adding}
              onClick={() => void add()}
            >
              {t("add")}
            </Button>
          }
        />
      </SettingGroup>

      {hasFolders && recoveryKit?.set === false && (
        <SettingGroup>
          <LinkRow
            href={`/settings?${SETTINGS_TAB_PARAM}=privacy`}
            icon={<LifeBuoy className="h-4 w-4" />}
            title={t("kitTitle")}
            subtitle={t("kitDesc")}
          />
        </SettingGroup>
      )}

      <ConfirmDialog
        open={askBackground}
        onOpenChange={setAskBackground}
        title={t("askTitle")}
        description={t("askDesc")}
        confirmLabel={t("askAllow")}
        cancelLabel={t("askLater")}
        onConfirm={() => void changeBackground(true)}
      />

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title={t("removeTitle", { name: removeTarget?.name ?? "" })}
        description={t("removeDesc")}
        confirmLabel={t("removeConfirm")}
        loading={removing}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
