"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cancelAccountDeletion } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Banner } from "@/components/ui/banner";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { AlertTriangle } from "@/lib/icons";
import { formatDateShort } from "@/lib/utils";

export function AccountDeletionBanner() {
  const t = useTranslations("auth");
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [keeping, setKeeping] = useState(false);

  if (!user?.deletion_scheduled_at) return null;

  const keep = async () => {
    const token = useAuthStore.getState().accessToken;
    if (!token) return;
    setKeeping(true);
    try {
      await cancelAccountDeletion(token);
      setUser({ ...user, deletion_scheduled_at: undefined });
      toast.success(t("deletion.cancelled"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deletion.cancelFailed"));
    } finally {
      setKeeping(false);
    }
  };

  return (
    <Banner
      kind="error"
      role="alert"
      icon={AlertTriangle}
      title={t("deletion.title", { date: formatDateShort(user.deletion_scheduled_at) })}
      body={t("deletion.body")}
      className="mb-4 sm:mb-6"
      actions={[
        {
          label: t("deletion.keep"),
          onClick: () => void keep(),
          disabled: keeping,
          variant: "outline",
          icon: keeping ? <LogoSpinner size={14} speed="fast" /> : undefined,
        },
      ]}
    />
  );
}
