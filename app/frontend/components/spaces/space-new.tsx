"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useVaultReady } from "@/components/spaces/use-vault-ready";
import { useEffect, useMemo, useState } from "react";
import { createSpace, warmSpaceKeys } from "@/lib/spaces";
import { ensureUserKeypair } from "@/lib/keys";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { useFilesQuery } from "@/store/files";
import { usePassphraseStore } from "@/store/passphrase";
import { useSpaceAdds } from "@/store/space-adds";
import { toast } from "@/store/toast";
import { useSpaceBatchLimit } from "@/hooks/useSpaceBatchLimit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { FilePicker } from "@/components/spaces/file-picker";
import {
  inviteErrorMessage,
  inviteMember,
  inviteRoles,
  InviteForm,
} from "@/components/spaces/invites";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Notice, PageShell, SpaceBreadcrumb } from "@/components/spaces/shared";
import type { SpaceRole } from "@/lib/spaces";
import type { FileMetadata, SharedVault } from "@/types";
import { Plus, X } from "@/lib/icons";

interface PendingInvite {
  email: string;
  role: SpaceRole;
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>
      {hint && <p className="text-xs text-[var(--color-text-muted)]">{hint}</p>}
    </div>
  );
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

async function runInvites(vault: SharedVault, invites: PendingInvite[], t: Translate) {
  let ok = 0;
  const failed: string[] = [];
  for (const inv of invites) {
    try {
      await inviteMember(vault, inv.email, inv.role);
      ok++;
    } catch (err) {
      failed.push(`${inv.email}: ${inviteErrorMessage(err, t)}`);
    }
  }
  void queryClient.invalidateQueries({ queryKey: qk.space(vault.id) });
  void queryClient.invalidateQueries({ queryKey: qk.spaces });
  if (ok > 0) toast.success(t("new.invited", { count: ok }));
  for (const msg of failed) toast.warning(msg);
}

const NO_FILES: FileMetadata[] = [];

export function SpaceNew() {
  const t = useTranslations("spaces");
  const router = useRouter();
  const { data: files = NO_FILES, isPending: filesLoading } = useFilesQuery();
  const batchLimit = useSpaceBatchLimit();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sizeLimitGb, setSizeLimitGb] = useState("");
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [showPicker, setShowPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const passphrase = usePassphraseStore.getState().getPassphrase();
    if (passphrase) void ensureUserKeypair(passphrase);
  }, []);

  const fileIds = useMemo(() => [...selected], [selected]);
  useEffect(() => {
    if (fileIds.length === 0) return;
    const t = setTimeout(() => warmSpaceKeys(fileIds), 300);
    return () => clearTimeout(t);
  }, [fileIds]);

  const overLimit = selected.size > batchLimit;

  const ready = useVaultReady();

  const submit = () => {
    setError("");
    if (!name.trim()) {
      setError(t("new.errName"));
      return;
    }
    if (overLimit) return;
    const gb = parseFloat(sizeLimitGb);
    if (sizeLimitGb.trim() && !(gb > 0)) {
      setError(t("new.errLimit"));
      return;
    }
    const limitBytes = sizeLimitGb.trim() ? Math.round(gb * 1024 * 1024 * 1024) : 0;
    ready(async () => {
      setCreating(true);
      try {
        const vault = await createSpace(name.trim(), description.trim(), [], limitBytes);
        queryClient.setQueryData<SharedVault[]>(qk.spaces, (prev) => [vault, ...(prev ?? [])]);
        void queryClient.invalidateQueries({ queryKey: qk.spaces });
        if (fileIds.length > 0) useSpaceAdds.getState().enqueue(vault, fileIds, name.trim());
        if (invites.length > 0) void runInvites(vault, invites, t);
        toast.success(t("new.created", { name: name.trim() }));
        router.push(`/spaces/${vault.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("new.createFailed"));
        setCreating(false);
      }
    });
  };

  return (
    <PageShell>
      <SpaceBreadcrumb
        crumbs={[{ label: t("shared.spaces"), href: "/spaces" }, { label: t("list.newSpace") }]}
      />
      <PageHeader title={t("list.newSpace")} description={t("new.description")} />

      <form
        className="mx-auto max-w-3xl space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <section className="space-y-4">
          <SectionHeading title={t("new.details")} />
          <Input
            label={t("new.nameLabel")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("new.namePlaceholder")}
            maxLength={80}
            autoFocus
            required
          />
          <Input
            label={t("new.descriptionLabel")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("new.optional")}
          />
          <Input
            label={t("new.limitLabel")}
            type="number"
            min="0"
            step="0.5"
            value={sizeLimitGb}
            onChange={(e) => setSizeLimitGb(e.target.value)}
            placeholder={t("new.limitPlaceholder")}
          />
        </section>

        <section className="space-y-3 border-t border-[var(--color-border)] pt-6">
          <SectionHeading title={t("new.inviteTitle")} hint={t("new.inviteHint")} />
          <InviteForm
            roles={inviteRoles(true)}
            actionLabel={t("new.add")}
            onSubmit={(email, role) => {
              if (invites.some((i) => i.email.toLowerCase() === email.toLowerCase())) {
                return t("new.alreadyListed");
              }
              setInvites((prev) => [...prev, { email, role }]);
              return null;
            }}
          />
          {invites.length > 0 && (
            <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
              {invites.map((inv) => (
                <li key={inv.email} className="flex items-center gap-3 px-3 py-2">
                  <UserAvatar userId={inv.email} name={inv.email} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
                    {inv.email}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {t(`role.${inv.role}`)}
                  </span>
                  <button
                    type="button"
                    aria-label={t("new.remove", { email: inv.email })}
                    onClick={() => setInvites((prev) => prev.filter((i) => i !== inv))}
                    className="rounded-md p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3 border-t border-[var(--color-border)] pt-6">
          <div className="flex items-end justify-between gap-3">
            <SectionHeading title={t("new.filesTitle")} hint={t("new.filesHint")} />
            {!showPicker && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setShowPicker(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("new.chooseFiles")}
              </Button>
            )}
          </div>
          {showPicker && (
            <>
              <FilePicker
                files={files}
                loading={filesLoading}
                selected={selected}
                onSelectedChange={(next) => setSelected(next)}
                listClassName="max-h-80"
              />
              <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
                {selected.size > 0
                  ? t("shared.filesSelected", { count: selected.size })
                  : t("new.noneSelected")}
                {Number.isFinite(batchLimit) &&
                  ` · ${t("shared.batchHint", { limit: batchLimit })}`}
              </p>
              {overLimit && (
                <Notice tone="warn">
                  {t("new.overLimit", { limit: batchLimit, over: selected.size - batchLimit })}
                </Notice>
              )}
            </>
          )}
        </section>

        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-5">
          <Button type="button" variant="ghost" onClick={() => router.push("/spaces")}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={creating || !name.trim() || overLimit}>
            {creating ? t("new.creating") : t("new.create")}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
