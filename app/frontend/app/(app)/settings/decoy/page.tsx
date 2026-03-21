"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { getDecoyStatus, setupDecoy, deleteDecoy, listDecoyFiles, addDecoyFile, deleteDecoyFile } from "@/lib/api";
import type { DecoyStatus, DecoyFile } from "@/types";
import Link from "next/link";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function DecoySettingsPage() {
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
      setError(err instanceof Error ? err.message : "Failed to setup");
    } finally {
      setSetting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDecoy();
      setStatus({ configured: false, enabled: false, file_count: 0 });
      setFiles([]);
    } catch {
      // ignore
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

  const handleDeleteFile = async (id: string) => {
    try {
      await deleteDecoyFile(id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-[var(--color-text-muted)] text-sm">Loading...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          Settings
        </Link>
        <h1 className="text-2xl font-heading font-bold text-[var(--color-text)] mt-1">
          Plausible Deniability
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Set a decoy password that shows a fake vault when used. For journalists, activists, and border crossings.
        </p>
      </div>

      {/* Setup / Status */}
      <div className="p-5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--color-text)]">Decoy Vault</h2>
          {status?.configured && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              status.enabled
                ? "bg-green-500/10 text-green-400"
                : "bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)]"
            }`}>
              {status.enabled ? "Active" : "Disabled"}
            </span>
          )}
        </div>

        {!status?.configured ? (
          <div className="space-y-3">
            <p className="text-xs text-[var(--color-text-muted)]">
              Set a decoy password. When someone forces you to log in, use this password instead.
              They will see fake files instead of your real vault.
            </p>
            <div className="space-y-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Decoy password"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm decoy password"
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
              />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              onClick={handleSetup}
              disabled={setting || !password}
              className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {setting ? "Setting up..." : "Enable Decoy Vault"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-muted)]">
              {status.file_count} decoy files configured
            </span>
            <button
              onClick={handleDelete}
              className="text-xs px-3 py-1 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Remove Decoy Vault
            </button>
          </div>
        )}
      </div>

      {/* Decoy files */}
      {status?.configured && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-[var(--color-text-secondary)]">
              Decoy Files ({files.length})
            </h2>
            <button
              onClick={() => setShowAddFile(!showAddFile)}
              className="text-xs px-3 py-1 rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors"
            >
              {showAddFile ? "Cancel" : "Add File"}
            </button>
          </div>

          <AnimatePresence>
            {showAddFile && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
                        File Name
                      </label>
                      <input
                        type="text"
                        value={fileName}
                        onChange={(e) => setFileName(e.target.value)}
                        placeholder="vacation-photos.zip"
                        className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
                        Size (MB)
                      </label>
                      <input
                        type="number"
                        value={fileSize}
                        onChange={(e) => setFileSize(e.target.value)}
                        placeholder="25"
                        className="w-full px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAddFile}
                    disabled={adding || !fileName.trim()}
                    className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    {adding ? "Adding..." : "Add Decoy File"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {files.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)] py-4 text-center">
              Add some innocent-looking fake files to make the decoy vault convincing.
            </p>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm text-[var(--color-text)] truncate">
                      {file.original_name}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                      {formatBytes(file.original_size)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteFile(file.id)}
                    className="text-xs px-2 py-1 rounded-md hover:bg-red-500/10 transition-colors text-red-400 shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
        <h3 className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">How it works</h3>
        <ul className="text-xs text-[var(--color-text-muted)] leading-relaxed space-y-1">
          <li>1. Set a decoy password (different from your real password)</li>
          <li>2. Add innocent-looking fake files to the decoy vault</li>
          <li>3. If forced to log in, use the decoy password</li>
          <li>4. The attacker sees the fake files, your real vault stays hidden</li>
          <li>5. There is no way for an attacker to tell the difference</li>
        </ul>
      </div>
    </div>
  );
}
