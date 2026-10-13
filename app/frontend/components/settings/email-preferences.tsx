"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { getEmailPrefs, setEmailPrefs } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { toast } from "@/store/toast";
import { Switch } from "@/components/ui/switch";
import { SettingGroup, ValueRow } from "@/components/settings/settings-primitives";
import { Mail } from "@/lib/icons";

export function EmailPreferences() {
  const t = useTranslations("settings.emailPrefs");
  const { data } = useQuery({ queryKey: qk.emailPrefs, queryFn: getEmailPrefs });
  if (!data) return null;

  const toggle = async (subscribed: boolean) => {
    const previous = data;
    queryClient.setQueryData(qk.emailPrefs, { email_opt_out: !subscribed });
    try {
      await setEmailPrefs(!subscribed);
    } catch {
      queryClient.setQueryData(qk.emailPrefs, previous);
      toast.error(t("saveFailed"));
    }
  };

  return (
    <SettingGroup label={t("label")} footnote={t("footnote")}>
      <ValueRow
        icon={<Mail className="h-4 w-4" />}
        title={t("announcements")}
        subtitle={t("announcementsDesc")}
        trailing={
          <Switch
            checked={!data.email_opt_out}
            onCheckedChange={toggle}
            aria-label={t("announcements")}
            className="data-[state=checked]:bg-[var(--color-accent)] data-[state=unchecked]:bg-[var(--color-surface-3)]"
          />
        }
      />
    </SettingGroup>
  );
}
