"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { badgeVariants } from "@/components/ui/badge";
import {
  adminCreateToken,
  adminDeleteToken,
  adminListTokens,
  adminToggleTokenScope,
} from "@/lib/api";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { useAdminList } from "@/hooks/useAdminList";
import { qk } from "@/lib/query-keys";
import { DataTable } from "@/components/admin/data-table";
import { EMPTY_REAUTH, ReauthFields, reauthReady } from "@/components/admin/reauth-fields";
import { toast } from "@/store/toast";
import { cn, formatDateShort } from "@/lib/utils";
import { Key, Trash2, Globe, User, Plus, X } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import type { PlatformTokenInfo } from "@/types";
import { TokenScopeConfirm } from "@/components/settings/token-scope-confirm";
import { PLATFORM_NAMES as platformNames } from "@/lib/platforms";
import { useOverridesFor } from "@/hooks/useOverridesFor";

/** The acting admin's own platform tokens, paged, plus adding a new one. */
export function TokenManagement() {
  const tr = useTranslations("admin.tokens");
  const list = useAdminList("tokens", { sort: "created_at", pageSize: 10 });
  const page = useAdminQuery(qk.adminList("tokens", list.params), () =>
    adminListTokens(list.params),
  );
  const tokens = page.data?.tokens ?? [];
  const othersCount = page.data?.others_count ?? 0;
  const onRefresh = page.refresh;
  const [showForm, setShowForm] = useState(false);
  const [platform, setPlatform] = useState("github");
  const [token, setToken] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlatformTokenInfo | null>(null);
  const [scopeTarget, setScopeTarget] = useState<PlatformTokenInfo | null>(null);
  const [scopeChanging, setScopeChanging] = useState(false);
  const [reauth, setReauth] = useState(EMPTY_REAUTH);

  // Optimistic scope flips; they clear when fresh data arrives from the parent.
  const [scopeOverrides, setScopeOverrides] = useOverridesFor<boolean>(tokens);

  const resolveGlobal = (t: PlatformTokenInfo) =>
    t.id in scopeOverrides ? scopeOverrides[t.id] : t.is_global;

  const handleCreate = async () => {
    if (!token.trim()) return;
    setCreating(true);
    try {
      const result = await adminCreateToken(
        { platform, token: token.trim(), is_global: isGlobal },
        reauth,
      );
      toast.success(tr("added", { username: result.username }));
      setToken("");
      setReauth(EMPTY_REAUTH);
      setShowForm(false);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("createFailed"));
    } finally {
      setCreating(false);
    }
  };

  const executeScopeChange = async () => {
    const t = scopeTarget;
    if (!t) return;
    const newScope = !resolveGlobal(t);
    setScopeChanging(true);
    setScopeOverrides((prev) => ({ ...prev, [t.id]: newScope }));
    try {
      await adminToggleTokenScope(t.id, newScope, reauth);
      onRefresh();
      setScopeTarget(null);
      setReauth(EMPTY_REAUTH);
    } catch (err) {
      setScopeOverrides((prev) => {
        const next = { ...prev };
        delete next[t.id];
        return next;
      });
      toast.error(err instanceof Error ? err.message : tr("scopeFailed"));
    } finally {
      setScopeChanging(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    try {
      await adminDeleteToken(deleteTarget.id, reauth);
      toast.success(tr("deleted"));
      setDeleteTarget(null);
      setReauth(EMPTY_REAUTH);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("deleteFailed"));
    } finally {
      setDeleting(null);
    }
  };

  // Pill shape shared by the scope badges (rounded-full, gap, py-1, medium weight)
  const scopePillClass = "gap-1.5 rounded-full py-1 font-medium";

  const scopeVariant = (t: PlatformTokenInfo) =>
    resolveGlobal(t) ? ("accent" as const) : ("amber" as const);

  return (
    <>
      <DataTable
        title={
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
              {tr("title")}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {tr("countMine", { count: page.data?.total ?? 0 })}
              {othersCount > 0 && ` · ${tr("fromOthers", { count: othersCount })}`}
            </p>
          </div>
        }
        toolbar={
          <Button
            variant={showForm ? "secondary" : "primary"}
            size="sm"
            onClick={() => {
              setShowForm(!showForm);
              setReauth(EMPTY_REAUTH);
            }}
          >
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showForm ? tr("cancel") : tr("add")}
          </Button>
        }
        subheader={
          showForm && (
            <div className="animate-fade-in space-y-4 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]/50 p-5">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="sm:w-44">
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger className="h-10" aria-label={tr("platform")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="github">GitHub</SelectItem>
                      <SelectItem value="gitlab">GitLab</SelectItem>
                      <SelectItem value="huggingface">Hugging Face</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Input
                    type="password"
                    placeholder={tr("placeholder")}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    icon={<Key className="h-4 w-4" />}
                  />
                </div>
              </div>
              <ReauthFields value={reauth} onChange={setReauth} className="" />
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={isGlobal}
                    onCheckedChange={(checked) => setIsGlobal(checked === true)}
                  />
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    {tr("globalToken")} <span className="hidden sm:inline">{tr("globalHint")}</span>
                  </span>
                </label>
                <Button
                  onClick={handleCreate}
                  disabled={creating || !token.trim() || !reauthReady(reauth)}
                  className="w-full sm:w-auto"
                >
                  {creating ? (
                    <span className="flex items-center gap-2">
                      <LogoSpinner size={14} speed="fast" />
                      {tr("adding")}
                    </span>
                  ) : (
                    tr("add")
                  )}
                </Button>
              </div>
            </div>
          )
        }
        label={tr("title")}
        rows={tokens}
        rowKey={(tk) => tk.id}
        list={list}
        total={page.data?.total ?? 0}
        loading={page.loading}
        fetching={page.fetching}
        error={page.error}
        onRetry={page.refresh}
        empty={{
          icon: <Key className="h-7 w-7 text-[var(--color-text-muted)]" />,
          title: tr("emptyTitle"),
          description: tr("emptyDesc"),
        }}
        columns={[
          {
            id: "platform",
            header: tr("platform"),
            cell: (tk) => (
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)] sm:flex">
                  <Key className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--color-text)]">
                    {platformNames[tk.platform] ?? tk.platform}
                  </span>
                  <span className="block truncate text-xs text-[var(--color-text-muted)]">
                    @{tk.username}
                  </span>
                </span>
              </span>
            ),
          },
          {
            id: "scope",
            header: tr("scope"),
            cell: (tk) => {
              const g = resolveGlobal(tk);
              return (
                <button
                  type="button"
                  onClick={() => setScopeTarget(tk)}
                  title={g ? tr("makeLocalHint") : tr("makeGlobalHint")}
                  aria-label={g ? tr("makeLocal") : tr("makeGlobal")}
                  className={cn(
                    badgeVariants({ variant: scopeVariant(tk) }),
                    scopePillClass,
                    "cursor-pointer hover:opacity-80 focus:ring-0 focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
                  )}
                >
                  {g ? <Globe className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                  {g ? tr("global") : tr("local")}
                </button>
              );
            },
          },
          {
            id: "added",
            header: tr("added_col"),
            cell: (tk) => (
              <span className="tabular-nums text-[var(--color-text-muted)]">
                {formatDateShort(tk.created_at)}
              </span>
            ),
          },
        ]}
        rowActions={(tk) => [
          {
            label: resolveGlobal(tk) ? tr("makeLocal") : tr("makeGlobal"),
            icon: resolveGlobal(tk) ? User : Globe,
            onSelect: () => setScopeTarget(tk),
          },
          {
            label: tr("delete"),
            icon: Trash2,
            destructive: true,
            disabled: deleting === tk.id,
            onSelect: () => setDeleteTarget(tk),
            separatorBefore: true,
          },
        ]}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setReauth(EMPTY_REAUTH);
          }
        }}
        destructive
        title={tr("deleteTitle")}
        description={
          deleteTarget
            ? `${tr("deleteDesc", { platform: platformNames[deleteTarget.platform] ?? deleteTarget.platform, username: deleteTarget.username })}${deleteTarget.is_global ? ` ${tr("deleteGlobalWarn")}` : ""}`
            : ""
        }
        confirmLabel={tr("delete")}
        loading={deleting === deleteTarget?.id}
        confirmDisabled={!reauthReady(reauth)}
        onConfirm={executeDelete}
      >
        <ReauthFields value={reauth} onChange={setReauth} className="" />
      </ConfirmDialog>
      <TokenScopeConfirm
        target={
          scopeTarget
            ? {
                platform: scopeTarget.platform,
                username: scopeTarget.username,
                toGlobal: !resolveGlobal(scopeTarget),
              }
            : null
        }
        loading={scopeChanging}
        onCancel={() => {
          setScopeTarget(null);
          setReauth(EMPTY_REAUTH);
        }}
        onConfirm={() => void executeScopeChange()}
        confirmDisabled={!reauthReady(reauth)}
      >
        <ReauthFields value={reauth} onChange={setReauth} className="" />
      </TokenScopeConfirm>
    </>
  );
}
