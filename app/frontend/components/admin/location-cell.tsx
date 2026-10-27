"use client";

import { useTranslations } from "next-intl";
import {
  countryName,
  displayCountry,
  formatPlace,
  signupCountryIfMoved,
  type Located,
} from "@/lib/geo";

/** Country code chip plus the country's name, in the page language. */
export function CountryLabel({ code, className }: { code: string; className?: string }) {
  const t = useTranslations("admin.location");
  if (!code)
    return <span className={className ?? "text-[var(--color-text-muted)]"}>{t("unknown")}</span>;
  return (
    <span className={className ?? "inline-flex min-w-0 items-center gap-1.5"}>
      <span className="inline-flex h-[18px] min-w-[1.6rem] flex-shrink-0 items-center justify-center rounded-[5px] bg-[var(--color-surface-2)] px-1 font-mono text-[10px] font-semibold tracking-wide text-[var(--color-text-secondary)] ring-1 ring-inset ring-[var(--color-border)]">
        {code}
      </span>
      <span className="truncate">{countryName(code)}</span>
    </span>
  );
}

/** A user's country, their city and region, and where they signed up when that differs. */
export function LocationCell({ user }: { user: Located }) {
  const t = useTranslations("admin.location");
  const code = displayCountry(user);
  const place = user.last_country ? formatPlace(user.last_city, user.last_region) : "";
  const moved = signupCountryIfMoved(user);
  return (
    <div className="min-w-0 text-sm">
      <CountryLabel code={code} />
      {(place || moved) && (
        <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
          {place}
          {place && moved && " · "}
          {moved && t("signedUpFrom", { country: moved })}
        </p>
      )}
    </div>
  );
}
