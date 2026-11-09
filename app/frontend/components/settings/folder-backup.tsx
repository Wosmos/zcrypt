"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LinkRow, SettingGroup, ValueRow } from "@/components/settings/settings-primitives";
import { useVaultLockContext } from "@/components/providers/vault-lock-provider";
import { ensureUserKeypair } from "@/lib/keys";
import { toBase64 } from "@/lib/crypto";
import { SETTINGS_TAB_PARAM } from "@/lib/settings-tab";
import { formatRelativeTime } from "@/lib/utils";
import {
  addBackupFolder,
  listBackupFolders,
  pickBackupFolder,
  removeBackupFolder,
  runBackupNow,
  subscribeBackup,
  type BackupFolder,
  type BackupPass,
} from "@/lib/tauri";
import { Folder, LifeBuoy, RefreshCw, UploadCloud } from "@/lib/icons";
import { useKeysStore } from "@/store/keys";
import { toast } from "@/store/toast";

/** SQLite's `datetime('now')` is UTC without a zone; WebKit can't parse it as is. */
export function scanTime(value: string): number | null {
  if (!value) return null;
  const ts = new Date(`${value.replace(" ", "T")}Z`).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function errorText(err: unknown, fallback: string): string {
  if (typeof err === "string" && err) return err;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function FolderBackup() {
  const t = useTranslations("settings.folderBackup");
  const vault = useVaultLockContext();
  const recoveryKit = useKeysStore((s) => s.recoveryKit);
  const [folders, setFolders] = useState<BackupFolder[] | null>(null);
  const [passes, setPasses] = useState<Record<string, BackupPass>>({});
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<BackupFolder | null>(null);
  const [removing, setRemoving] = useState(false);

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
        {hasFolders && (
          <ValueRow
            icon={<RefreshCw className="h-4 w-4" />}
            title={t("autoTitle")}
            subtitle={t("autoDesc")}
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
