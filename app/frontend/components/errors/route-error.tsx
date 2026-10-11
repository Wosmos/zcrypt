"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

export function RouteError({
  error,
  reset,
  label,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  label: string;
}) {
  const t = useTranslations("app");
  useEffect(() => {
    console.error(`${label} error:`, error);
  }, [error, label]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="max-w-md text-center">
        <h2 className="text-xl font-bold text-white mb-2">{t("error.title")}</h2>
        <p className="text-neutral-400 mb-6 text-sm">
          {error.message || t("error.fallback")}
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-200 transition-colors"
        >
          {t("error.retry")}
        </button>
      </div>
    </div>
  );
}
