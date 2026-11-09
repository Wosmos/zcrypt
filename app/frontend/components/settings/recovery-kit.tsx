"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingGroup, ValueRow } from "@/components/settings/settings-primitives";
import { RecoveryKitDialog } from "@/components/settings/recovery-kit-dialog";
import { useVaultLockContext } from "@/components/providers/vault-lock-provider";
import { useRecoveryKit } from "@/hooks/useRecoveryKit";
import { deleteRecoveryKit } from "@/lib/api";
import { LifeBuoy } from "@/lib/icons";
import { toast } from "@/store/toast";

export function RecoveryKitSetting() {
  const t = useTranslations("settings.recoveryKit");
  const locale = useLocale();
  const vault = useVaultLockContext();
  const { status, markSet, markRemoved } = useRecoveryKit();
  const [passphrase, setPassphrase] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

  const isSet = status?.set === true;
  const subtitle = !status
    ? undefined
    : isSet && status.createdAt
      ? t("savedOn", { date: new Date(status.createdAt).toLocaleDateString(locale) })
      : isSet
        ? t("saved")
        : t("notSet");

  const remove = async () => {
    setRemoving(true);
    try {
      await deleteRecoveryKit();
      markRemoved();
      setConfirmRemove(false);
      toast.success(t("removed"));
    } catch {
      toast.error(t("removeFailed"));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <SettingGroup label={t("label")} footnote={t("footnote")}>
        <ValueRow
          icon={<LifeBuoy className="h-4 w-4" />}
          title={t("title")}
          subtitle={subtitle}
          trailing={
            <span className="flex items-center gap-2">
              {isSet && (
                <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)}>
                  {t("remove")}
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={!status}
                onClick={() => vault.withPassphrase(setPassphrase)}
              >
                {isSet ? t("replace") : t("create")}
              </Button>
            </span>
          }
        />
      </SettingGroup>

      <RecoveryKitDialog
        open={passphrase !== null}
        onOpenChange={(open) => {
          if (!open) setPassphrase(null);
        }}
        passphrase={passphrase ?? ""}
        replacing={isSet}
        onSaved={markSet}
      />

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={t("removeTitle")}
        description={t("removeDesc")}
        confirmLabel={t("removeConfirm")}
        destructive
        loading={removing}
        onConfirm={() => void remove()}
      />
    </>
  );
}
