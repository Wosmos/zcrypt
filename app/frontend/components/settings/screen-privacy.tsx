"use client";

import { useState, useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/switch";
import { SettingGroup, ValueRow } from "@/components/settings/settings-primitives";
import { isScreenCaptureAllowed, setScreenCaptureAllowed } from "@/lib/android";
import { EyeOff } from "@/lib/icons";

const noSubscription = () => () => {};
const noShell = () => null;

export function ScreenPrivacy() {
  const fromShell = useSyncExternalStore(noSubscription, isScreenCaptureAllowed, noShell);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const allowed = chosen ?? fromShell;
  if (allowed === null) return null;

  const toggle = (next: boolean) => {
    setScreenCaptureAllowed(next);
    setChosen(next);
  };

  return (
    <SettingGroup
      label="Screen privacy"
      footnote="Off by default, so decrypted files never show up in the app switcher, screenshots or screen recordings."
    >
      <ValueRow
        icon={<EyeOff className="h-4 w-4" />}
        title="Allow screenshots"
        subtitle="Also shows the app in the recents view"
        trailing={
          <Switch
            checked={allowed}
            onCheckedChange={toggle}
            aria-label="Allow screenshots"
            className="data-[state=checked]:bg-[var(--color-accent)] data-[state=unchecked]:bg-[var(--color-surface-3)]"
          />
        }
      />
    </SettingGroup>
  );
}
