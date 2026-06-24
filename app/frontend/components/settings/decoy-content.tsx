"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import {
  getDecoyStatus,
  setupDecoy,
  deleteDecoy,
  listDecoyFiles,
  addDecoyFile,
  deleteDecoyFile,
} from "@/lib/api";
import type { DecoyStatus, DecoyFile } from "@/types";
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
  const [fileSize, setFileSize] = useState("");
  const [adding, setAdding] = useState(false);

  // Destructive confirmations
  const [confirmRemoveVault, setConfirmRemoveVault] = useState(false);
  const [removingVault, setRemovingVault] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<DecoyFile | null>(null);
  const [deletingFile, setDeletingFile] = useState(false);

  useEffect(() => {
    Promise.all([getDecoyStatus(), listDecoyFiles()])
      .then(([s, f]) => {
        setStatus(s);
        setFiles(f);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSetup = async () => {
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSetting(true);
    try {
      await setupDecoy({ decoy_password: password });
      setStatus({ configured: true, enabled: true, file_count: files.length });
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set up decoy vault");
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

  const handleAddFile = async () => {
    if (!fileName.trim()) return;
    setAdding(true);
    try {
      const sizeBytes = parseFloat(fileSize || "0") * 1024 * 1024; // MB to bytes
      const file = await addDecoyFile({ name: fileName.trim(), size: Math.round(sizeBytes) });
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
        <ArrowLeft className="h-3 w-3" /> Back to settings
      </Link>

      <PageHeader
        eyebrow="Privacy"
        title="Plausible deniability"
        description="Set a decoy password that reveals a fake vault when used — for journalists, activists, and border crossings."
      />

      {/* Setup / Status */}
      <div className="panel p-6">
        <Section
          title="Decoy vault"
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
                {status?.enabled ? "Active" : "Disabled"}
              </Badge>
            ) : undefined
          }
        >
          {!configured ? (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                Set a decoy password. When someone forces you to log in, use this password
                instead — they will see fake files rather than your real vault.
              </p>
              <Input
                type="password"
                label="Decoy password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                icon={<Lock className="h-4 w-4" />}
              />
              <Input
                type="password"
                label="Confirm decoy password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter decoy password"
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
              <Button onClick={handleSetup} disabled={setting || !password} className="w-full sm:w-auto">
                {setting ? (
                  <span className="flex items-center gap-2">
                    <LogoSpinner size={14} speed="fast" /> Setting up...
                  </span>
                ) : (
                  "Enable decoy vault"
                )}
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 px-4 py-3">
              <span className="text-sm text-[var(--color-text-secondary)] tabular-nums">
                {status?.file_count ?? files.length} decoy{" "}
                {(status?.file_count ?? files.length) === 1 ? "file" : "files"} configured
              </span>
              <Button variant="danger" size="sm" onClick={() => setConfirmRemoveVault(true)}>
                Remove decoy vault
              </Button>
            </div>
          )}
        </Section>
      </div>

      {/* Decoy files */}
      {configured && (
        <div className="panel p-6">
          <Section
            title={`Decoy files (${files.length})`}
            description="Add innocent-looking fake files to make the decoy vault convincing."
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAddFile((v) => !v)}
                aria-expanded={showAddFile}
              >
                {showAddFile ? (
                  "Cancel"
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add file
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
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                          type="text"
                          label="File name"
                          value={fileName}
                          onChange={(e) => setFileName(e.target.value)}
                          placeholder="vacation-photos.zip"
                        />
                        <Input
                          type="number"
                          label="Size (MB)"
                          value={fileSize}
                          onChange={(e) => setFileSize(e.target.value)}
                          placeholder="25"
                        />
                      </div>
                      <Button
                        onClick={handleAddFile}
                        disabled={adding || !fileName.trim()}
                        size="sm"
                      >
                        {adding ? (
                          <span className="flex items-center gap-2">
                            <LogoSpinner size={12} speed="fast" /> Adding...
                          </span>
                        ) : (
                          "Add decoy file"
                        )}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {files.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center">
                  <FileText className="mx-auto mb-2 h-7 w-7 text-[var(--color-text-muted)]" />
                  <p className="text-sm text-[var(--color-text-secondary)]">No decoy files yet</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs text-[var(--color-text-muted)]">
                    Add some innocent-looking fake files to make the decoy vault convincing.
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
                          {file.original_name}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
                          {formatBytes(file.original_size)}
                        </p>
                      </div>
                      <IconButton
                        icon={Trash2}
                        label={`Remove ${file.original_name}`}
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
        <Section title="How it works">
          <ol className="space-y-2.5">
            {[
              "Set a decoy password — different from your real password.",
              "Add innocent-looking fake files to the decoy vault.",
              "If forced to log in, use the decoy password instead.",
              "The attacker sees the fake files; your real vault stays hidden.",
              "There is no way for an attacker to tell the difference.",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-1)] text-[10px] font-bold tabular-nums text-[var(--color-text-secondary)] ring-1 ring-[var(--color-border)]">
                  {i + 1}
                </span>
                <span className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {/* Confirmations */}
      <ConfirmDialog
        open={confirmRemoveVault}
        onOpenChange={(open) => { if (!open) setConfirmRemoveVault(false); }}
        destructive
        title="Remove decoy vault?"
        description="This permanently deletes your decoy password and all decoy files. Your real vault is unaffected."
        confirmLabel="Remove"
        loading={removingVault}
        onConfirm={handleRemoveVault}
      />
      <ConfirmDialog
        open={!!fileToDelete}
        onOpenChange={(open) => { if (!open) setFileToDelete(null); }}
        destructive
        title="Remove decoy file?"
        description={
          fileToDelete
            ? `Remove "${fileToDelete.original_name}" from the decoy vault?`
            : ""
        }
        confirmLabel="Remove"
        loading={deletingFile}
        onConfirm={handleDeleteFile}
      />
    </div>
  );
}
