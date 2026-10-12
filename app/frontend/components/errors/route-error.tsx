"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { CloudOff, RefreshCw, WifiOff } from "@/lib/icons";
import { isNetworkFailure } from "@/lib/http-error";

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
  const tc = useTranslations("ui.connection");
  useEffect(() => {
    console.error(`${label} error:`, error);
  }, [error, label]);

  if (isNetworkFailure(error)) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    const Icon = offline ? WifiOff : CloudOff;
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
        <div className="max-w-sm text-center">
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-300">
            <Icon className="h-6 w-6" aria-hidden />
          </span>
          <h2 className="mb-2 text-xl font-bold text-white">
            {offline ? tc("offlineTitle") : tc("downTitle")}
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-neutral-400">
            {offline ? tc("offlineBody") : tc("downBody")}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-200"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            {tc("retryNow")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="max-w-md text-center">
        <h2 className="text-xl font-bold text-white mb-2">{t("error.title")}</h2>
        <p className="text-neutral-400 mb-6 text-sm">{error.message || t("error.fallback")}</p>
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
