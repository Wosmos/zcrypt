"use client";

import { useEffect } from "react";
import { useLocaleControl } from "@/components/providers/i18n-provider";
import { pushBackupNotifications } from "@/lib/backup-notifications";
import { usePreferencesStore } from "@/store/preferences";

const CATALOG_SETTLE_MS = 1500;

/** Keeps the shell's backup notification choice and wording in step with the notification settings and language. */
export function useBackupNotifications() {
  const success = usePreferencesStore((s) => s.sound.areas.transfers);
  const problems = usePreferencesStore((s) => s.sound.areas.problems);
  const { locale } = useLocaleControl();
  useEffect(() => {
    void pushBackupNotifications(success, problems);
    const later = setTimeout(
      () => void pushBackupNotifications(success, problems),
      CATALOG_SETTLE_MS,
    );
    return () => clearTimeout(later);
  }, [success, problems, locale]);
}
