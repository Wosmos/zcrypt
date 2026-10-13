"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { listExpiringVaults, createExpiringVault, deleteExpiringVault } from "@/lib/api";
import { useFilesQuery } from "@/store/files";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { setListData } from "@/lib/query-cache";
import type { ExpiringVault, FileMetadata } from "@/types";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/checkbox";
import { SkeletonRow } from "@/components/ui/skeletons";
import { Plus, Trash2, Clock } from "@/lib/icons";
import { useActionError } from "./shared/use-action-error";
import { ToolLoadError } from "./shared/tool-states";
import { cn, formatDateTime, formatExpiry, fileNameById } from "@/lib/utils";

const EXPIRY_CHOICES = [
  { value: "1", key: "h1" },
  { value: "6", key: "h6" },
  { value: "24", key: "h24" },
  { value: "168", key: "d7" },
  { value: "720", key: "d30" },
  { value: "2160", key: "d90" },
];

const inputClass =
  "h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none transition-all focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10";
const labelClass = "text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]";

const NO_VAULTS: ExpiringVault[] = [];
const NO_FILES: FileMetadata[] = [];

export function ExpiringTab() {
  const t = useTranslations("tools");
  const reportError = useActionError();
  const reduceMotion = useReducedMotion();
  const vaultsQuery = useQuery({ queryKey: qk.expiring, queryFn: listExpiringVaults });
  const vaults = vaultsQuery.data ?? NO_VAULTS;
  const setVaults = (fn: (prev: ExpiringVault[]) => ExpiringVault[]) =>
    setListData<ExpiringVault>(qk.expiring, fn);
  const filesQuery = useFilesQuery();
  const files = filesQuery.data ?? NO_FILES;
  const loading = vaultsQuery.isPending || filesQuery.isPending;
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expiresIn, setExpiresIn] = useState("24");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ExpiringVault | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async () => {
    setError("");
    if (!name.trim()) {
      setError(t("expiring.errName"));
      return;
    }
    if (selectedFiles.length === 0) {
      setError(t("expiring.errFiles"));
      return;
    }
    setCreating(true);
    try {
      const expiresAt = new Date(Date.now() + Number(expiresIn) * 3600000).toISOString();
      const vault = await createExpiringVault({
        name: name.trim(),
        description: description.trim(),
        expires_at: expiresAt,
        file_ids: selectedFiles,
      });
      setVaults((prev) => [vault, ...prev]);
      setShowCreate(false);
      setName("");
      setDescription("");
      setSelectedFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("expiring.createFailed"));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteExpiringVault(pendingDelete.id);
      setVaults((prev) => prev.filter((v) => v.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (err) {
      reportError(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-text-secondary)]">{t("expiring.intro")}</p>
        <Button
          onClick={() => {
            setShowCreate(!showCreate);
            setError("");
          }}
          size="sm"
          variant={showCreate ? "secondary" : "primary"}
        >
          {showCreate ? (
            t("common.cancel")
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" /> {t("expiring.create")}
            </>
          )}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {showCreate && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="panel space-y-4 p-6">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">
                {t("expiring.newTitle")}
              </h3>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("expiring.nameLabel")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("expiring.namePlaceholder")}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("expiring.descLabel")}</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("expiring.descPlaceholder")}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("expiring.expiresIn")}</label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                  className={inputClass}
                >
                  {EXPIRY_CHOICES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {t(`expiring.choice.${c.key}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("expiring.selectFiles")}</label>
                {files.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">{t("common.noFilesYet")}</p>
                ) : (
                  <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-xl border border-[var(--color-border)] p-2">
                    {files.map((file) => (
                      <label
                        key={file.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-1)]"
                      >
                        <Checkbox
                          checked={selectedFiles.includes(file.id)}
                          onCheckedChange={() =>
                            setSelectedFiles((prev) =>
                              prev.includes(file.id)
                                ? prev.filter((id) => id !== file.id)
                                : [...prev, file.id],
                            )
                          }
                        />
                        <span className="truncate text-sm text-[var(--color-text)]">
                          {file.original_name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {selectedFiles.length > 0 && (
                  <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
                    {t("common.fileCountSelected", { count: selectedFiles.length })}
                  </p>
                )}
              </div>
              {error && (
                <div
                  className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400"
                  role="alert"
                >
                  {error}
                </div>
              )}
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating ? t("expiring.creating") : t("expiring.create")}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="panel divide-y divide-[var(--color-border)] px-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : vaultsQuery.isError ? (
        <div className="panel">
          <ToolLoadError error={vaultsQuery.error} onRetry={() => void vaultsQuery.refetch()} />
        </div>
      ) : vaults.length === 0 && !showCreate ? (
        <div className="panel">
          <EmptyState
            icon={<Clock className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title={t("expiring.emptyTitle")}
            description={t("expiring.emptyDesc")}
          />
        </div>
      ) : vaults.length > 0 ? (
        <div className="space-y-2">
          {vaults.map((vault) => (
            <motion.div
              key={vault.id}
              initial={reduceMotion ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("panel p-4", vault.expired && "opacity-60")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium text-[var(--color-text)]">{vault.name}</h3>
                    <span
                      className={cn(
                        "flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide tabular-nums",
                        vault.expired
                          ? "bg-red-500/10 text-red-600 dark:text-red-400"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {vault.expired ? t("expiring.expired") : formatExpiry(vault.expires_at)}
                    </span>
                  </div>
                  {vault.description && (
                    <p className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">
                      {vault.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                    <span className="tabular-nums">
                      {t("common.fileCount", { count: vault.file_ids.length })}
                    </span>
                    <span>
                      {t("expiring.expiresAt", { date: formatDateTime(vault.expires_at) })}
                    </span>
                  </div>
                  {vault.file_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {vault.file_ids.slice(0, 5).map((fid) => (
                        <span
                          key={fid}
                          className="max-w-[150px] truncate rounded-md bg-[var(--color-surface-1)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]"
                        >
                          {fileNameById(files, fid)}
                        </span>
                      ))}
                      {vault.file_ids.length > 5 && (
                        <span className="px-1 py-0.5 text-[10px] text-[var(--color-text-muted)]">
                          {t("expiring.more", { count: vault.file_ids.length - 5 })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <IconButton
                  icon={Trash2}
                  label={t("expiring.deleteLabel")}
                  variant="danger"
                  iconClassName="h-3.5 w-3.5"
                  onClick={() => setPendingDelete(vault)}
                />
              </div>
            </motion.div>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        destructive
        title={t("expiring.confirmTitle")}
        description={
          pendingDelete?.name
            ? t("expiring.confirmDescNamed", { name: pendingDelete.name })
            : t("expiring.confirmDesc")
        }
        confirmLabel={t("common.delete")}
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
