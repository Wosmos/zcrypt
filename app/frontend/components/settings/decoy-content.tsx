"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import {
  getDecoyStatus,
  setupDecoy,
  deleteDecoy,
  listDecoyFiles,
  addDecoyFile,
  renameDecoyFile,
  deleteDecoyFile,
} from "@/lib/api";
import type { DecoyStatus, DecoyFile } from "@/types";
import { deriveNameKey } from "@/lib/name-crypto";
import { isSealed, openText, sealText, LOCKED } from "@/lib/sealed";
import { useAuthStore } from "@/store/auth";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { ArrowLeft, FileText, Plus, Trash2, Lock, AlertTriangle } from "@/lib/icons";

export function DecoyContent() {
  const t = useTranslations("settings.decoy");
  const [status, setStatus] = useState<DecoyStatus | null>(null);
  const [files, setFiles] = useState<DecoyFile[]>([]);
  const [loading, setLoading] = useState(true);

  // Setup form
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setting, setSetting] = useState(false);
  const [error, setError] = useState("");

  // Add file form
  const [showAddFile, setShowAddFile] = useState(false);
  const [fileName, setFileName] = useState("");
  // Decoy filenames are sealed under the DECOY password (the only secret a decoy
  // session has). Managing them here needs that password once per visit; it never
  // leaves the browser. `names` holds the opened labels for display.
  const [decoyKeyPass, setDecoyKeyPass] = useState("");
  const [decoyKey, setDecoyKey] = useState<CryptoKey | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const userId = useAuthStore((st) => st.user?.id);
  const [fileSize, setFileSize] = useState("");
  const [adding, setAdding] = useState(false);

  // Destructive confirmations
  const [confirmRemoveVault, setConfirmRemoveVault] = useState(false);
  const [removingVault, setRemovingVault] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<DecoyFile | null>(null);
  const [deletingFile, setDeletingFile] = useState(false);

  // Cached read, seeded once into local state; local edits are mirrored back
  // into the cache so a revisit opens instantly and current.
  const decoyQuery = useQuery({
    queryKey: qk.decoy,
    queryFn: async () => {
      const [s, f] = await Promise.all([getDecoyStatus(), listDecoyFiles(null)]);
      return { status: s, files: f };
    },
  });
  const [seeded, setSeeded] = useState(false);
  const settled = !decoyQuery.isPending;
  const loaded = decoyQuery.data;
  if (!seeded && settled) {
    setSeeded(true);
    if (loaded) {
      setStatus(loaded.status);
      setFiles(loaded.files);
    }
    setLoading(false);
  }
  useEffect(() => {
    if (seeded && status) queryClient.setQueryData(qk.decoy, { status, files });
  }, [seeded, status, files]);

  const handleSetup = async () => {
    setError("");
    if (password.length < 6) {
      setError(t("passwordShort"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("mismatch"));
      return;
    }
    setSetting(true);
    try {
      await setupDecoy({ decoy_password: password });
      setStatus({ configured: true, enabled: true, file_count: files.length });
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("setupFailed"));
    } finally {
      setSetting(false);
    }
  };

  const handleRemoveVault = async () => {
    setRemovingVault(true);
    try {
      await deleteDecoy();
      setStatus({ configured: false, enabled: false, file_count: 0 });
      setFiles([]);
      setConfirmRemoveVault(false);
    } catch {
      setConfirmRemoveVault(false);
    } finally {
      setRemovingVault(false);
    }
  };

  const keyReady = !!userId && decoyKeyPass.length >= 6;
  useEffect(() => {
    if (!userId || !keyReady) return;
    let cancelled = false;
    (async () => {
      const key = await deriveNameKey(decoyKeyPass, userId);
      const opened: Record<string, string> = {};
      for (const f of files) opened[f.id] = await openText(f.original_name, key);
      if (cancelled) return;
      setDecoyKey(key);
      setNames(opened);
      // Legacy plaintext decoy names: seal them now that we hold the key, but
      // only once this password is proven right against an existing sealed name
      // (or there are none yet), so a typo can't seal names under a wrong key.
      const sealed = files.filter((f) => isSealed(f.original_name));
      const proven = sealed.length === 0 || sealed.some((f) => opened[f.id] !== LOCKED);
      if (!proven) return;
      for (const f of files) {
        if (isSealed(f.original_name)) continue;
        const enc = await sealText(f.original_name, key);
        await renameDecoyFile(f.id, enc).catch(() => {});
        if (!cancelled)
          setFiles((prev) => prev.map((x) => (x.id === f.id ? { ...x, original_name: enc } : x)));
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [decoyKeyPass, userId, files, keyReady]);

  const activeKey = keyReady ? decoyKey : null;
  const keyProven =
    !!activeKey &&
    (!files.some((f) => isSealed(f.original_name)) ||
      files.some((f) => isSealed(f.original_name) && names[f.id] && names[f.id] !== LOCKED));
  const displayName = (f: DecoyFile) =>
    isSealed(f.original_name) ? (names[f.id] ?? LOCKED) : f.original_name;

  const handleAddFile = async () => {
    if (!fileName.trim() || !activeKey || !keyProven) return;
    setAdding(true);
    try {
      const sizeBytes = parseFloat(fileSize || "0") * 1024 * 1024; // MB to bytes
      const file = await addDecoyFile(
        { name: fileName.trim(), size: Math.round(sizeBytes) },
        activeKey,
      );
      setNames((prev) => ({ ...prev, [file.id]: file.original_name }));
      setFiles((prev) => [file, ...prev]);
      setFileName("");
      setFileSize("");
      setShowAddFile(false);
    } catch {
      // ignore
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!fileToDelete) return;
    setDeletingFile(true);
    try {
      await deleteDecoyFile(fileToDelete.id);
      setFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id));
      setFileToDelete(null);
    } catch {
      setFileToDelete(null);
    } finally {
      setDeletingFile(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LogoSpinner size="md" speed="fast" />
      </div>
    );
  }

  const configured = !!status?.configured;

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 rounded text-xs text-[var(--color-text-muted)] outline-none transition-colors hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
      >
        <ArrowLeft className="h-3 w-3" /> {t("back")}
      </Link>

      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      {/* Setup / Status */}
      <div className="panel p-6">
        <Section
          title={t("vault")}
          actions={
            configured ? (
              <Badge
                variant="outline"
                className={
                  status?.enabled
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-muted)]"
                }
              >
                {status?.enabled ? t("active") : t("disabled")}
              </Badge>
            ) : undefined
          }
        >
          {!configured ? (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                {t("setupIntro")}
              </p>
              <Input
                type="password"
                label={t("password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("passwordPlaceholder")}
                icon={<Lock className="h-4 w-4" />}
              />
              <Input
                type="password"
                label={t("confirmPassword")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("confirmPlaceholder")}
                icon={<Lock className="h-4 w-4" />}
              />
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-500 dark:text-red-400"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <Button
                onClick={handleSetup}
                disabled={setting || !password}
                className="w-full sm:w-auto"
              >
                {setting ? (
                  <span className="flex items-center gap-2">
                    <LogoSpinner size={14} speed="fast" /> {t("settingUp")}
                  </span>
                ) : (
                  t("enable")
                )}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 px-4 py-3">
              <span className="text-sm text-[var(--color-text-secondary)] tabular-nums">
                {t("configured", { count: status?.file_count ?? files.length })}
              </span>
              <Button variant="danger" size="sm" onClick={() => setConfirmRemoveVault(true)}>
                {t("removeVault")}
              </Button>
            </div>
          )}
        </Section>
      </div>

      {/* Decoy files */}
      {configured && (
        <div className="panel p-6">
          <Section
            title={t("filesTitle", { count: files.length })}
            description={t("filesDesc")}
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddFile((v) => !v)}
                aria-expanded={showAddFile}
              >
                {showAddFile ? (
                  t("cancel")
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> {t("addFile")}
                  </span>
                )}
              </Button>
            }
          >
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {showAddFile && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 p-4">
                      <Input
                        type="password"
                        label={t("password")}
                        value={decoyKeyPass}
                        onChange={(e) => setDecoyKeyPass(e.target.value)}
                        placeholder={t("sealPlaceholder")}
                        autoComplete="off"
                      />
                      {activeKey && !keyProven && (
                        <p className="text-xs text-red-600 dark:text-red-400">
                          {t("wrongPassword")}
                        </p>
                      )}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                          type="text"
                          label={t("fileName")}
                          value={fileName}
                          onChange={(e) => setFileName(e.target.value)}
                          placeholder="vacation-photos.zip"
                        />
                        <Input
                          type="number"
                          label={t("sizeMb")}
                          value={fileSize}
                          onChange={(e) => setFileSize(e.target.value)}
                          placeholder="25"
                        />
                      </div>
                      <Button
                        onClick={handleAddFile}
                        disabled={adding || !fileName.trim() || !keyProven}
                        size="sm"
                      >
                        {adding ? (
                          <span className="flex items-center gap-2">
                            <LogoSpinner size={12} speed="fast" /> {t("adding")}
                          </span>
                        ) : (
                          t("addDecoyFile")
                        )}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {files.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center">
                  <FileText className="mx-auto mb-2 h-7 w-7 text-[var(--color-text-muted)]" />
                  <p className="text-sm text-[var(--color-text-secondary)]">{t("noFiles")}</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs text-[var(--color-text-muted)]">
                    {t("noFilesDesc")}
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {files.map((file) => (
                    <li
                      key={file.id}
                      className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 px-3.5 py-2.5"
                    >
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[var(--color-text)]">
                          {displayName(file)}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
                          {formatBytes(file.original_size)}
                        </p>
                      </div>
                      <IconButton
                        icon={Trash2}
                        label={t("removeFile", { name: displayName(file) })}
                        variant="ghost"
                        iconClassName="h-3.5 w-3.5"
                        onClick={() => setFileToDelete(file)}
                        className="text-[var(--color-text-muted)] hover:text-red-500"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        </div>
      )}

      {/* How it works */}
      <div className="panel p-6">
        <Section title={t("howTitle")}>
          <ol className="space-y-2.5">
            {["s1", "s2", "s3", "s4", "s5"].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-1)] text-[10px] font-bold tabular-nums text-[var(--color-text-secondary)] ring-1 ring-[var(--color-border)]">
                  {i + 1}
                </span>
                <span className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  {t(`steps.${step}`)}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {/* Confirmations */}
      <ConfirmDialog
        open={confirmRemoveVault}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveVault(false);
        }}
        destructive
        title={t("removeVaultTitle")}
        description={t("removeVaultDesc")}
        confirmLabel={t("remove")}
        loading={removingVault}
        onConfirm={handleRemoveVault}
      />
      <ConfirmDialog
        open={!!fileToDelete}
        onOpenChange={(open) => {
          if (!open) setFileToDelete(null);
        }}
        destructive
        title={t("removeFileTitle")}
        description={fileToDelete ? t("removeFileDesc", { name: displayName(fileToDelete) }) : ""}
        confirmLabel={t("remove")}
        loading={deletingFile}
        onConfirm={handleDeleteFile}
      />
    </div>
  );
}
