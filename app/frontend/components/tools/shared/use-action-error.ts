"use client";

import { useTranslations } from "next-intl";
import { toast } from "@/store/toast";
import { useFriendlyError } from "@/hooks/useConnectivity";

export function useActionError() {
  const t = useTranslations("tools");
  const friendly = useFriendlyError();
  return (err: unknown) => toast.error(friendly(err, t("common.actionFailed")));
}
