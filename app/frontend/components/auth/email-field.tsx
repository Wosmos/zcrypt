"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Mail } from "@/lib/icons";

/** The email input shared by login, register, and other auth forms. */
export function EmailField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("auth");
  return (
    <Input
      label={t("email")}
      type="email"
      name="email"
      placeholder={t("emailPlaceholder")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      icon={<Mail className="h-4 w-4" />}
      required
      autoComplete="email"
    />
  );
}
