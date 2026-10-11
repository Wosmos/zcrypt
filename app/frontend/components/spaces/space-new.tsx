"use client";

import { useRouter } from "next/navigation";
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
import { MemberAvatar } from "@/components/spaces/space-ui";
import { Notice, PageShell, SpaceBreadcrumb, plural } from "@/components/spaces/shared";
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

async function runInvites(vault: SharedVault, invites: PendingInvite[]) {
  let ok = 0;
  const failed: string[] = [];
  for (const inv of invites) {
    try {
      await inviteMember(vault, inv.email, inv.role);
      ok++;
    } catch (err) {
      failed.push(`${inv.email}: ${inviteErrorMessage(err)}`);
    }
  }
  void queryClient.invalidateQueries({ queryKey: qk.space(vault.id) });
  void queryClient.invalidateQueries({ queryKey: qk.spaces });
  if (ok > 0) toast.success(`Invited ${ok === 1 ? "1 person" : `${ok} people`}`);
  for (const msg of failed) toast.warning(msg);
}

const NO_FILES: FileMetadata[] = [];

export function SpaceNew() {
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
      setError("Give the space a name.");
      return;
    }
    if (overLimit) return;
    const gb = parseFloat(sizeLimitGb);
    if (sizeLimitGb.trim() && !(gb > 0)) {
      setError("Storage limit must be a positive number of GB, or left blank.");
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
        if (invites.length > 0) void runInvites(vault, invites);
        toast.success(`Space “${name.trim()}” created`);
        router.push(`/spaces/${vault.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create the space");
        setCreating(false);
      }
    });
  };

  return (
    <PageShell>
      <SpaceBreadcrumb crumbs={[{ label: "Spaces", href: "/spaces" }, { label: "New Space" }]} />
      <PageHeader
        title="New Space"
        description="Group files and invite people to collaborate. Everything stays end-to-end encrypted: the server never sees the key."
      />

      <form
        className="mx-auto max-w-3xl space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <section className="space-y-4">
          <SectionHeading title="Details" />
          <Input
            label="Space name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Project Atlas"
            maxLength={80}
            autoFocus
            required
          />
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
          <Input
            label="Storage limit (GB)"
            type="number"
            min="0"
            step="0.5"
            value={sizeLimitGb}
            onChange={(e) => setSizeLimitGb(e.target.value)}
            placeholder="Optional. Leave blank for no limit"
          />
        </section>

        <section className="space-y-3 border-t border-[var(--color-border)] pt-6">
          <SectionHeading
            title="Invite people"
            hint="Optional. They get the space key sealed to their own encryption key."
          />
          <InviteForm
            roles={inviteRoles(true)}
            actionLabel="Add"
            onSubmit={(email, role) => {
              if (invites.some((i) => i.email.toLowerCase() === email.toLowerCase())) {
                return "Already on the list.";
              }
              setInvites((prev) => [...prev, { email, role }]);
              return null;
            }}
          />
          {invites.length > 0 && (
            <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
              {invites.map((inv) => (
                <li key={inv.email} className="flex items-center gap-3 px-3 py-2">
                  <MemberAvatar id={inv.email} label={inv.email} className="h-7 w-7 text-[11px]" />
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">
                    {inv.email}
                  </span>
                  <span className="text-xs capitalize text-[var(--color-text-muted)]">
                    {inv.role}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${inv.email}`}
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
            <SectionHeading
              title="Add files"
              hint="Optional. They are added in the background after the space is created."
            />
            {!showPicker && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setShowPicker(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Choose files
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
                {selected.size > 0 ? `${plural(selected.size, "file")} selected` : "None selected"}
                {Number.isFinite(batchLimit) && ` · up to ${batchLimit} at a time on your plan`}
              </p>
              {overLimit && (
                <Notice tone="warn">
                  Your plan adds up to {batchLimit} files at a time. Deselect{" "}
                  {selected.size - batchLimit} to continue.
                </Notice>
              )}
            </>
          )}
        </section>

        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-5">
          <Button type="button" variant="ghost" onClick={() => router.push("/spaces")}>
            Cancel
          </Button>
          <Button type="submit" disabled={creating || !name.trim() || overLimit}>
            {creating ? "Creating..." : "Create Space"}
          </Button>
        </div>
      </form>
    </PageShell>
  );
}
