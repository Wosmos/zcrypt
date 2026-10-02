"use client";

import { useAuthStore } from "@/store/auth";
import type { AdminReauth } from "@/lib/api";

export const EMPTY_REAUTH: AdminReauth = { password: "", code: "" };

const inputClass =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2.5 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)]/40 transition-all";

/** The server refuses role changes and account deletions on a bare session,
 *  so the acting admin re-enters their password (and a 2FA code if enabled). */
export function ReauthFields({
  value,
  onChange,
}: {
  value: AdminReauth;
  onChange: (next: AdminReauth) => void;
}) {
  const needsCode = useAuthStore((s) => s.user?.totp_enabled === true);
  return (
    <div className="mx-6 mt-4 space-y-2">
      <p className="text-xs text-[var(--color-text-muted)]">Confirm it&apos;s you to continue.</p>
      <input
        type="password"
        autoComplete="current-password"
        aria-label="Your password"
        placeholder="Your password"
        value={value.password}
        onChange={(e) => onChange({ ...value, password: e.target.value })}
        className={inputClass}
      />
      {needsCode && (
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="2FA code"
          placeholder="2FA code"
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value.trim() })}
          className={inputClass}
        />
      )}
    </div>
  );
}

export function reauthReady(value: AdminReauth): boolean {
  if (!value.password) return false;
  return useAuthStore.getState().user?.totp_enabled !== true || value.code.length > 0;
}
