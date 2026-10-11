"use client";

import Link from "next/link";
import { spaceKeysReady, useVaultReady } from "@/components/spaces/use-vault-ready";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { deleteSharedVault, removeSharedVaultMember, updateSharedVaultMemberRole } from "@/lib/api";
import { pinPeerKey } from "@/lib/key-pins";
import { localFingerprint } from "@/lib/keys";
import {
  canManageMember,
  memberKeyStatus,
  rotateSpaceKey,
  updateSpaceDetails,
  type SpaceRole,
} from "@/lib/spaces";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useKeysStore } from "@/store/keys";
import { toast } from "@/store/toast";
import { useSpaceMeta } from "@/hooks/useSpaceMeta";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { KeyChangeDeclinedError, withKeyConfirm } from "@/components/spaces/key-change";
import {
  inviteErrorMessage,
  inviteMember,
  inviteRoles,
  InviteForm,
  RoleSelect,
} from "@/components/spaces/invites";
import { MemberAvatar, RoleBadge } from "@/components/spaces/space-ui";
import { Notice, PageShell, SpaceBreadcrumb, plural } from "@/components/spaces/shared";
import {
  patchSpace,
  refreshSpace,
  refreshSpaces,
  useSpaceDetail,
} from "@/components/spaces/use-space";
import type { SharedVaultDetail, SharedVaultMember } from "@/types";
import {
  AlertTriangle,
  Check,
  Fingerprint,
  Key,
  Loader2,
  LogOut,
  ShieldCheck,
  Trash2,
} from "@/lib/icons";

function Section({
  id,
  title,
  description,
  children,
  tone,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
  tone?: "danger";
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "scroll-mt-6 space-y-4 rounded-2xl border p-5",
        tone === "danger"
          ? "border-red-500/25 bg-red-500/[0.03]"
          : "border-[var(--color-border)] bg-[var(--color-surface)]",
      )}
    >
      <div className="space-y-0.5">
        <h2 id={`${id}-title`} className="text-sm font-semibold text-[var(--color-text)]">
          {title}
        </h2>
        {description && (
          <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

type KeyState = Awaited<ReturnType<typeof memberKeyStatus>>;

function KeyStatus({
  member,
  isSelf,
  selfFingerprint,
}: {
  member: SharedVaultMember;
  isSelf: boolean;
  selfFingerprint: string | null;
}) {
  const [state, setState] = useState<KeyState | null>(null);
  const [tick, setTick] = useState(0);
  const [pinning, setPinning] = useState(false);

  useEffect(() => {
    if (isSelf) return;
    let cancelled = false;
    void memberKeyStatus(member).then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [member, isSelf, tick]);

  const pin = async () => {
    if (!member.public_key) return;
    setPinning(true);
    await pinPeerKey(member.user_id, member.public_key);
    setPinning(false);
    setTick((t) => t + 1);
  };

  if (isSelf) {
    return (
      <div className="space-y-0.5">
        <p className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
          <Fingerprint className="h-3 w-3 flex-shrink-0" />
          Your key
        </p>
        <p className="break-all font-mono text-[11px] text-[var(--color-text-secondary)]">
          {selfFingerprint ?? "Unlock your vault to see it"}
        </p>
      </div>
    );
  }
  if (!state) return <Skeleton className="h-3 w-48 rounded" />;

  const fp = (
    <p className="break-all font-mono text-[11px] text-[var(--color-text-secondary)]">
      {state.fingerprint}
    </p>
  );

  if (state.status === "unknown") {
    return (
      <p className="text-[11px] text-[var(--color-text-muted)]">
        No encryption key yet. They need to sign in and unlock their vault once.
      </p>
    );
  }
  if (state.status === "verified") {
    return (
      <div className="space-y-0.5">
        <p className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3 flex-shrink-0" />
          Verified on this device
        </p>
        {fp}
      </div>
    );
  }
  if (state.status === "changed") {
    return (
      <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
        <p className="flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
          Key changed since you last verified
        </p>
        <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
          This can be a new device or a reset, or someone intercepting the key. Compare the
          fingerprint with them before trusting it.
        </p>
        {fp}
        <Button size="sm" variant="secondary" onClick={() => void pin()} disabled={pinning}>
          Trust new key
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <p className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
        <ShieldCheck className="h-3 w-3 flex-shrink-0" />
        Not verified yet. Compare this with them out of band.
      </p>
      {fp}
      <button
        type="button"
        onClick={() => void pin()}
        disabled={pinning}
        className="text-[11px] font-medium text-[var(--color-accent)] outline-none hover:underline focus-visible:underline"
      >
        Mark as verified
      </button>
    </div>
  );
}

export function SpaceSettings() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { query, detail, perms, userId } = useSpaceDetail(id);
  const ready = useVaultReady();
  const meta = useSpaceMeta(detail ?? undefined);
  const selfFingerprint = useKeysStore((s) => s.fingerprint);

  const [seed, setSeed] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [limitGb, setLimitGb] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const stamp = detail
    ? `${detail.id}|${meta.ready}|${meta.name}|${meta.description}|${detail.size_limit_bytes}`
    : "";
  if (detail && meta.ready && stamp !== seed) {
    setSeed(stamp);
    setName(meta.name);
    setDescription(meta.description);
    setLimitGb(
      detail.size_limit_bytes > 0 ? String(+(detail.size_limit_bytes / 1024 ** 3).toFixed(2)) : "",
    );
  }

  const [roleBusy, setRoleBusy] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [rotateError, setRotateError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<{
    member: SharedVaultMember;
    self: boolean;
  } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const spaceName = meta.name || "Space";
  const crumbs = [
    { label: "Spaces", href: "/spaces" },
    { label: spaceName, href: `/spaces/${id}` },
    { label: "Settings" },
  ];

  useEffect(() => {
    if (meta.ready) document.title = `Settings · ${meta.name} · Spaces`;
  }, [meta.ready, meta.name]);

  const loadedId = detail?.id;
  useEffect(() => {
    if (loadedId && window.location.hash) {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
    }
  }, [loadedId]);

  if (query.isPending && !detail) {
    return (
      <PageShell>
        <Skeleton className="h-5 w-52 rounded-md" />
        <Skeleton className="h-8 w-48 rounded-md" />
        <Skeleton className="h-48 w-full max-w-3xl rounded-2xl" />
        <Skeleton className="h-64 w-full max-w-3xl rounded-2xl" />
      </PageShell>
    );
  }
  if (!detail || !perms) {
    return (
      <PageShell>
        <SpaceBreadcrumb crumbs={crumbs} />
        <Notice tone="error">Couldn&apos;t load this space.</Notice>
      </PageShell>
    );
  }

  const d: SharedVaultDetail = detail;
  const canManage = perms.manage;

  const dirty =
    name.trim() !== meta.name ||
    description.trim() !== meta.description ||
    (limitGb.trim() === "" ? 0 : Math.round(parseFloat(limitGb) * 1024 ** 3)) !==
      d.size_limit_bytes;

  const save = async () => {
    setSaveError("");
    if (!name.trim()) {
      setSaveError("The name can't be empty.");
      return;
    }
    const gb = parseFloat(limitGb);
    if (limitGb.trim() && !(gb > 0)) {
      setSaveError("Storage limit must be a positive number of GB, or blank for none.");
      return;
    }
    const patch: { name?: string; description?: string; size_limit_bytes?: number } = {};
    if (name.trim() !== meta.name) patch.name = name.trim();
    if (description.trim() !== meta.description) patch.description = description.trim();
    const limit = limitGb.trim() ? Math.round(gb * 1024 ** 3) : 0;
    if (limit !== d.size_limit_bytes) patch.size_limit_bytes = limit;
    ready(async () => {
      setSaving(true);
      try {
        await updateSpaceDetails(d, patch);
        await Promise.all([refreshSpace(d.id), refreshSpaces()]);
        toast.success("Space updated");
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Couldn't save changes");
      } finally {
        setSaving(false);
      }
    });
  };

  const rotate = async (members: SharedVaultMember[]) => {
    await withKeyConfirm("a member", (acceptChangedKeys) =>
      rotateSpaceKey(d, members, d.files, { acceptChangedKeys }),
    );
    patchSpace(d.id, (x) => ({ ...x, needs_rotation: false }));
    void refreshSpace(d.id);
    void refreshSpaces();
  };

  const handleRotate = () => {
    setRotateError("");
    ready(async () => {
      setRotating(true);
      try {
        await rotate(d.members);
        toast.success("Space key rotated");
      } catch (err) {
        setRotateError(err instanceof Error ? err.message : "Key rotation failed");
      } finally {
        setRotating(false);
      }
    });
  };

  const handleRole = async (userIdOf: string, role: SpaceRole) => {
    setMemberError("");
    setRoleBusy(userIdOf);
    try {
      await updateSharedVaultMemberRole(d.id, userIdOf, role);
      patchSpace(d.id, (x) => ({
        ...x,
        members: x.members.map((m) => (m.user_id === userIdOf ? { ...m, role } : m)),
      }));
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Failed to change role");
      void refreshSpace(d.id);
    } finally {
      setRoleBusy(null);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    const { member, self } = removeTarget;
    setMemberError("");
    setRemoving(true);
    try {
      await removeSharedVaultMember(d.id, member.user_id);
      if (self) {
        queryClient.setQueryData<unknown[]>(qk.spaces, (prev) =>
          ((prev ?? []) as { id: string }[]).filter((v) => v.id !== d.id),
        );
        queryClient.removeQueries({ queryKey: qk.space(d.id) });
        void refreshSpaces();
        toast.success("You left the space");
        router.push("/spaces");
        return;
      }
      const remaining = d.members.filter((m) => m.user_id !== member.user_id);
      patchSpace(d.id, (x) => ({ ...x, members: remaining, needs_rotation: true }));
      if (perms.rotate) {
        try {
          await rotate(remaining);
        } catch (err) {
          setMemberError(
            err instanceof KeyChangeDeclinedError
              ? "Member removed and blocked, but re-keying was cancelled. Rotate the key to finish revoking their old key."
              : "Member removed and blocked, but re-keying failed. Use Rotate key to finish revoking their old key.",
          );
          void refreshSpace(d.id);
        }
      } else {
        void refreshSpace(d.id);
      }
      setRemoveTarget(null);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Failed to remove member");
      void refreshSpace(d.id);
      setRemoveTarget(null);
    } finally {
      setRemoving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteSharedVault(d.id);
      queryClient.setQueryData<{ id: string }[]>(qk.spaces, (prev) =>
        (prev ?? []).filter((v) => v.id !== d.id),
      );
      queryClient.removeQueries({ queryKey: qk.space(d.id) });
      toast.success("Space deleted");
      router.push("/spaces");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the space");
      setDeleting(false);
    }
  };

  const roleLabel = (m: SharedVaultMember) =>
    m.user_id === d.owner_id
      ? "Owner"
      : m.role === "admin"
        ? "Admin"
        : m.role === "editor"
          ? "Editor"
          : "Viewer";

  return (
    <PageShell>
      <SpaceBreadcrumb crumbs={crumbs} />
      <PageHeader
        eyebrow={spaceName}
        title="Space settings"
        actions={
          <Link href={`/spaces/${id}`} className={buttonClass("secondary", "md")}>
            Back to files
          </Link>
        }
      />

      <div className="max-w-3xl space-y-6">
        <Section
          id="general"
          title="General"
          description={
            canManage
              ? "The name and description are sealed under the space key: the server only stores ciphertext."
              : "Only admins and the owner can change these."
          }
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Input
              label="Space name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={!canManage}
            />
            <Input
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canManage}
              placeholder={canManage ? "Optional" : ""}
            />
            <Input
              label="Storage limit (GB)"
              type="number"
              min="0"
              step="0.5"
              value={limitGb}
              onChange={(e) => setLimitGb(e.target.value)}
              disabled={!canManage}
              placeholder="No limit"
            />
            {saveError && <Notice tone="error">{saveError}</Notice>}
            {canManage && (
              <div className="flex justify-end">
                <Button type="submit" disabled={saving || !dirty || !name.trim()}>
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            )}
          </form>
        </Section>

        <Section
          id="members"
          title={`Members (${d.members.length})`}
          description="Each member holds the space key sealed to their own encryption key. Compare fingerprints with them out of band to rule out a key swap."
        >
          <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
            {d.members.map((m) => {
              const label = m.username || m.email || "Member";
              const isSelf = m.user_id === userId;
              const manageable = canManageMember(perms, d, m);
              return (
                <li key={m.id} className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-start">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <MemberAvatar id={m.user_id} label={label} className="h-9 w-9 text-xs" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium text-[var(--color-text)]">
                        <span className="truncate">{label}</span>
                        {isSelf && (
                          <span className="text-xs font-normal text-[var(--color-text-muted)]">
                            (you)
                          </span>
                        )}
                      </p>
                      <KeyStatus
                        key={`${m.user_id}|${m.public_key ?? ""}`}
                        member={m}
                        isSelf={isSelf}
                        selfFingerprint={selfFingerprint ?? localFingerprint()}
                      />
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5 ps-12 sm:ps-0">
                    {manageable ? (
                      <RoleSelect
                        value={m.role}
                        roles={inviteRoles(perms.owner)}
                        onChange={(r) => void handleRole(m.user_id, r)}
                        label={`Role for ${label}`}
                        className="h-8 w-[5.5rem] rounded-lg text-xs"
                      />
                    ) : (
                      <RoleBadge role={roleLabel(m)} />
                    )}
                    {roleBusy === m.user_id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {manageable && !isSelf && (
                      <IconButton
                        icon={Trash2}
                        label={`Remove ${label}`}
                        onClick={() => setRemoveTarget({ member: m, self: false })}
                        className="h-8 w-8 hover:text-red-500"
                        iconClassName="h-3.5 w-3.5"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {memberError && <Notice tone="error">{memberError}</Notice>}

          {canManage && (
            <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                Invite a member
              </h3>
              <InviteForm
                roles={inviteRoles(perms.owner)}
                actionLabel="Invite"
                onSubmit={async (email, role) => {
                  if (!spaceKeysReady()) {
                    ready(async () => {});
                    return "Unlock your vault, then send the invite again.";
                  }
                  try {
                    const member = await inviteMember(d, email, role);
                    patchSpace(d.id, (x) => ({
                      ...x,
                      members: [...x.members.filter((m) => m.user_id !== member.user_id), member],
                    }));
                    void refreshSpace(d.id);
                    void refreshSpaces();
                    return null;
                  } catch (err) {
                    return inviteErrorMessage(err);
                  }
                }}
              />
            </div>
          )}
        </Section>

        <Section
          id="key"
          title="Your encryption key"
          description="Read this fingerprint to the people you share with (call them, don't message it). They should see exactly the same characters under your name in their member list."
        >
          <p className="break-all rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3.5 py-2.5 font-mono text-sm text-[var(--color-text)]">
            {selfFingerprint ?? localFingerprint() ?? "Unlock your vault to see your fingerprint."}
          </p>
        </Section>

        {perms.rotate && (
          <Section
            id="rotate"
            title="Rotate space key"
            description="Generates a new space key and re-wraps every file under it, so any old key a former member kept stops working. Needed after removing someone."
          >
            {d.needs_rotation && (
              <Notice tone="warn">
                A member was removed. Rotate now to lock out any copy of the old key.
              </Notice>
            )}
            {rotateError && <Notice tone="error">{rotateError}</Notice>}
            <Button
              variant={d.needs_rotation ? "primary" : "secondary"}
              onClick={() => void handleRotate()}
              disabled={rotating}
            >
              {rotating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Key className="h-4 w-4" />
              )}
              {rotating ? "Rotating..." : "Rotate key"}
            </Button>
          </Section>
        )}

        <Section
          id="danger"
          tone="danger"
          title="Danger zone"
          description={
            perms.owner
              ? "Deleting a space revokes access for everyone. Your original files are not deleted."
              : "Leaving removes your access to every file in this space. An admin can invite you again."
          }
        >
          {perms.owner ? (
            <Button
              variant="danger"
              onClick={() => {
                setTyped("");
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete this Space
            </Button>
          ) : (
            <Button
              variant="danger"
              onClick={() => {
                const me = d.members.find((m) => m.user_id === userId);
                if (me) setRemoveTarget({ member: me, self: true });
              }}
            >
              <LogOut className="h-4 w-4" />
              Leave this Space
            </Button>
          )}
        </Section>
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => {
          if (!removing && !o) setRemoveTarget(null);
        }}
        destructive
        title={removeTarget?.self ? "Leave this space?" : "Remove member and re-key the space?"}
        description={
          removeTarget?.self ? (
            <>You will lose access to every file in this space.</>
          ) : (
            <>
              <span className="font-medium text-[var(--color-text)]">
                {removeTarget?.member.username || removeTarget?.member.email}
              </span>{" "}
              loses access immediately. The space key is rotated and every file is re-wrapped under
              it, so any copy of the old key they kept becomes useless. Files stay for everyone
              else.
            </>
          )
        }
        confirmLabel={removeTarget?.self ? "Leave space" : "Remove and re-key"}
        loading={removing}
        onConfirm={() => void handleRemove()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (!deleting && !o) setDeleteOpen(false);
        }}
        destructive
        title="Delete this space?"
        description={
          <>
            This deletes <span className="font-medium text-[var(--color-text)]">{spaceName}</span>{" "}
            and revokes access for {plural(Math.max(0, d.members.length - 1), "other member")}. Type
            the name to confirm.
          </>
        }
        confirmLabel="Delete space"
        confirmDisabled={typed.trim() !== meta.name}
        loading={deleting}
        onConfirm={() => void handleDelete()}
      >
        <Input
          aria-label="Type the space name to confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={spaceName}
          autoComplete="off"
        />
      </ConfirmDialog>
    </PageShell>
  );
}
