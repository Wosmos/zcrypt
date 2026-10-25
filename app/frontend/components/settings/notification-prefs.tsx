"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { SettingGroup, ValueRow } from "@/components/settings/settings-primitives";
import { Bell, Play, Smartphone, Volume2 } from "@/lib/icons";
import { previewSound, SOUND_EVENTS } from "@/lib/sounds";
import { SOUND_AREAS, SOUND_SETS, usePreferencesStore } from "@/store/preferences";
import { cn } from "@/lib/utils";

const SWITCH_CLASS =
  "data-[state=checked]:bg-[var(--color-accent)] data-[state=unchecked]:bg-[var(--color-surface-3)]";

/**
 * Settings, Notifications: sounds and vibration. `notificationsExtra` is the
 * slot where the operating system notification controls are added.
 */
export function NotificationSettings({ notificationsExtra }: { notificationsExtra?: ReactNode }) {
  const t = useTranslations("settings.soundPrefs");
  const sound = usePreferencesStore((s) => s.sound);
  const setSound = usePreferencesStore((s) => s.setSound);
  const setSoundArea = usePreferencesStore((s) => s.setSoundArea);
  const off = !sound.enabled;

  return (
    <div className="space-y-5">
      <SettingGroup>
        <ValueRow
          icon={<Volume2 className="h-4 w-4" />}
          title={t("master")}
          subtitle={t("masterDesc")}
          trailing={
            <Switch
              checked={sound.enabled}
              onCheckedChange={(enabled) => setSound({ enabled })}
              aria-label={t("master")}
              className={SWITCH_CLASS}
            />
          }
        />
      </SettingGroup>

      <fieldset disabled={off} className={cn("min-w-0 space-y-5", off && "opacity-50")}>
        <SettingGroup label={t("groupSet")} footnote={t("setFootnote")}>
          <div role="radiogroup" aria-label={t("groupSet")} className="grid grid-cols-3 gap-2 p-3">
            {SOUND_SETS.map((set) => {
              const on = sound.set === set;
              return (
                <button
                  key={set}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setSound({ set });
                    previewSound("done", set);
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-start text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50",
                    on
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text)]"
                      : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]",
                  )}
                >
                  <span className="block font-medium">{t(`set.${set}`)}</span>
                  <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                    {t(`setDesc.${set}`)}
                  </span>
                </button>
              );
            })}
          </div>
          {SOUND_EVENTS.map((event) => (
            <ValueRow
              key={event}
              title={t(`event.${event}`)}
              subtitle={t(`eventDesc.${event}`)}
              trailing={
                <button
                  type="button"
                  onClick={() => previewSound(event)}
                  aria-label={t("previewAria", { event: t(`event.${event}`) })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50"
                >
                  <Play className="h-3.5 w-3.5" />
                  {t("preview")}
                </button>
              }
            />
          ))}
        </SettingGroup>

        <SettingGroup label={t("groupAreas")}>
          {SOUND_AREAS.map((area) => (
            <ValueRow
              key={area}
              icon={<Bell className="h-4 w-4" />}
              title={t(`area.${area}`)}
              trailing={
                <Switch
                  checked={sound.areas[area]}
                  onCheckedChange={(on) => setSoundArea(area, on)}
                  aria-label={t(`area.${area}`)}
                  className={SWITCH_CLASS}
                />
              }
            />
          ))}
        </SettingGroup>

        <SettingGroup>
          <ValueRow
            icon={<Smartphone className="h-4 w-4" />}
            title={t("vibrate")}
            subtitle={t("vibrateDesc")}
            trailing={
              <Switch
                checked={sound.vibrate}
                onCheckedChange={(vibrate) => setSound({ vibrate })}
                aria-label={t("vibrate")}
                className={SWITCH_CLASS}
              />
            }
          />
          <ValueRow
            title={t("backgroundOnly")}
            subtitle={t("backgroundOnlyDesc")}
            trailing={
              <Switch
                checked={sound.backgroundOnly}
                onCheckedChange={(backgroundOnly) => setSound({ backgroundOnly })}
                aria-label={t("backgroundOnly")}
                className={SWITCH_CLASS}
              />
            }
          />
        </SettingGroup>
      </fieldset>

      {notificationsExtra}
    </div>
  );
}
