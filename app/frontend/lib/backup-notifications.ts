import { isTauri, tauriInvoke } from "@/lib/tauri";
import { tr } from "@/store/translate";

export interface BackupNotifyPrefs {
  success: boolean;
  problems: boolean;
  templates: Record<string, string>;
}

const KEEP = { n: "{n}", folder: "{folder}" };

/** The localized backup notification texts, with {n} and {folder} left for the shell to fill. */
export function backupTemplates(): Record<string, string> {
  const t = (key: string) => tr(`notify.${key}`, KEEP);
  return {
    title: t("backupTitle"),
    files_one: t("backupFilesOne"),
    files_other: t("backupFilesOther"),
    files_from_one: t("backupFromOne"),
    files_from_other: t("backupFromOther"),
    photos_one: t("backupPhotosOne"),
    photos_other: t("backupPhotosOther"),
    signed_out: t("backupSignedOut"),
    offline: t("backupOffline"),
    failed_one: t("backupFailedOne"),
    failed_other: t("backupFailedOther"),
  };
}

/** Tells the desktop and Android shell which backup notifications to post and in which words. */
export async function pushBackupNotifications(success: boolean, problems: boolean): Promise<void> {
  if (!isTauri) return;
  const prefs: BackupNotifyPrefs = { success, problems, templates: backupTemplates() };
  try {
    await tauriInvoke("set_backup_notifications", { prefs });
  } catch {
    return;
  }
}
