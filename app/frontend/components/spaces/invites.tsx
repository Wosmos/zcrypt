"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { loadSpaceKey, shareSpace, type SpaceRole } from "@/lib/spaces";
import { withKeyConfirm, KeyChangeDeclinedError } from "@/components/spaces/key-change";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SharedVault, SharedVaultMember } from "@/types";

export function inviteRoles(isOwner: boolean): SpaceRole[] {
  return isOwner ? ["viewer", "editor", "admin"] : ["viewer", "editor"];
}

export class NoSpaceKeyError extends Error {
  constructor() {
    super("This space has no key you can share (it predates encrypted sharing).");
    this.name = "NoSpaceKeyError";
  }
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function inviteErrorMessage(err: unknown, t: Translate): string {
  if (err instanceof KeyChangeDeclinedError) return t("keyChange.declined");
  if (err instanceof NoSpaceKeyError) return t("invites.errorNoKey");
  const msg = err instanceof Error ? err.message : "";
  if (/no user|not found|404|published key/i.test(msg)) return t("invites.errorNoSharing");
  if (/only the owner/i.test(msg)) return msg;
  return t("invites.errorGeneric");
}

/** Seal the space key to one invitee, confirming a changed peer key if needed. */
export async function inviteMember(
  vault: SharedVault,
  email: string,
  role: SpaceRole,
): Promise<SharedVaultMember> {
  const spaceKey = await loadSpaceKey(vault);
  if (!spaceKey) {
    throw new NoSpaceKeyError();
  }
  return withKeyConfirm(email, (acceptChangedKeys) =>
    shareSpace(vault.id, spaceKey, email, role, { acceptChangedKeys }),
  );
}

export function RoleSelect({
  value,
  onChange,
  roles,
  className,
  label,
}: {
  value: SpaceRole;
  onChange: (role: SpaceRole) => void;
  roles: SpaceRole[];
  className?: string;
  label?: string;
}) {
  const t = useTranslations("spaces");
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SpaceRole)}>
      <SelectTrigger
        aria-label={label ?? t("role.label")}
        className={cn(
          "h-10 rounded-xl border-[var(--color-border)] bg-[var(--color-surface)] text-sm",
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
        {roles.map((r) => (
          <SelectItem key={r} value={r}>
            {t(`role.${r}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Email + role entry. `onSubmit` resolves to an error string, or null on success. */
export function InviteForm({
  roles,
  onSubmit,
  actionLabel,
  busyLabel,
  busy = false,
}: {
  roles: SpaceRole[];
  onSubmit: (email: string, role: SpaceRole) => Promise<string | null> | string | null;
  actionLabel: string;
  busyLabel?: string;
  busy?: boolean;
}) {
  const t = useTranslations("spaces");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<SpaceRole>("viewer");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const value = email.trim();
    if (!value) return;
    setPending(true);
    setError("");
    const res = await onSubmit(value, role);
    setPending(false);
    if (res) setError(res);
    else setEmail("");
  };

  const working = busy || pending;
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={t("invites.placeholder")}
          aria-label={t("invites.placeholder")}
          className="h-10 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
        />
        <RoleSelect value={role} onChange={setRole} roles={roles} className="w-full sm:w-32" />
        <Button
          type="button"
          variant="secondary"
          onClick={() => void submit()}
          disabled={working || !email.trim()}
        >
          {working ? (busyLabel ?? t("invites.adding")) : actionLabel}
        </Button>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
        <span>{t(`role.${role}`)}</span>: {t(`role.${role}Help`)}
        {!roles.includes("admin") && ` ${t("invites.adminOwnerOnly")}`}
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
