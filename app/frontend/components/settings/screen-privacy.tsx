"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { SettingGroup, ValueRow } from "@/components/settings/settings-primitives";
import { isScreenCaptureAllowed, setScreenCaptureAllowed } from "@/lib/android";
import { EyeOff } from "@/lib/icons";

const noSubscription = () => () => {};
const noShell = () => null;

export function ScreenPrivacy() {
  const t = useTranslations("settings.screenPrivacy");
  const fromShell = useSyncExternalStore(noSubscription, isScreenCaptureAllowed, noShell);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const allowed = chosen ?? fromShell;
  if (allowed === null) return null;

  const toggle = (next: boolean) => {
    setScreenCaptureAllowed(next);
    setChosen(next);
  };

  return (
    <SettingGroup label={t("label")} footnote={t("footnote")}>
      <ValueRow
        icon={<EyeOff className="h-4 w-4" />}
        title={t("allow")}
        subtitle={t("allowDesc")}
        trailing={
          <Switch
            checked={allowed}
            onCheckedChange={toggle}
            aria-label={t("allow")}
            className="data-[state=checked]:bg-[var(--color-accent)] data-[state=unchecked]:bg-[var(--color-surface-3)]"
          />
        }
      />
    </SettingGroup>
  );
}
