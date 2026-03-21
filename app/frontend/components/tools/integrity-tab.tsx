"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { listIntegritySnapshots, createIntegritySnapshot, checkFileIntegrity, getChangedFiles, listFiles } from "@/lib/api";
import type { IntegritySnapshot, FileMetadata } from "@/types";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { AlertTriangle } from "@/lib/icons";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function IntegrityTab() {
  const [snapshots, setSnapshots] = useState<IntegritySnapshot[]>([]);
  const [changes, setChanges] = useState<IntegritySnapshot[]>([]);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState("");
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    Promise.all([listIntegritySnapshots(), getChangedFiles(), listFiles()])
      .then(([snaps, changed, f]) => { setSnapshots(snaps); setChanges(changed); setFiles(f); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSnapshot = async () => {
    if (!selectedFile) return;
    setCreating(true);
    try { const snap = await createIntegritySnapshot(selectedFile); setSnapshots((prev) => [snap, ...prev]); }
    catch { /* ignore */ }
    finally { setCreating(false); }
  };

  const handleCheck = async (fileId: string) => {
    setChecking(true);
    try {
      const result = await checkFileIntegrity(fileId);
      setSnapshots((prev) => [result, ...prev]);
      if (result.status !== "ok") { setChanges((prev) => [result, ...prev.filter((c) => c.file_id !== fileId)]); }
      else { setChanges((prev) => prev.filter((c) => c.file_id !== fileId)); }
    } catch { /* ignore */ }
    finally { setChecking(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LogoSpinner size="md" speed="fast" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Changes alert */}
      {changes.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">{changes.length} file(s) with integrity changes detected</p>
            <div className="space-y-1 mt-2">
              {changes.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span>{c.file_name}</span>
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold uppercase ${c.status === "changed" ? "bg-amber-500/10 text-amber-500" : "bg-red-500/10 text-red-400"}`}>
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create snapshot / check */}
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold">Take Snapshot / Check Integrity</h3>
        </div>
        <div className="p-5 flex gap-3">
          <select value={selectedFile} onChange={(e) => setSelectedFile(e.target.value)}
            className="flex-1 h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm focus:outline-none focus:border-[var(--color-accent)]/40">
            <option value="">Select a file...</option>
            {files.map((f) => <option key={f.id} value={f.id}>{f.original_name}</option>)}
          </select>
          <Button onClick={handleSnapshot} disabled={!selectedFile || creating}>
            {creating ? "..." : "Snapshot"}
          </Button>
          <Button variant="secondary" onClick={() => selectedFile && handleCheck(selectedFile)} disabled={!selectedFile || checking}>
            {checking ? "..." : "Check"}
          </Button>
        </div>
      </section>

      {/* Snapshot history */}
      <div>
        <h3 className="section-label mb-3">Snapshot History</h3>
        {snapshots.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-[var(--color-text-muted)]">No snapshots yet.</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Select a file and take a snapshot.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {snapshots.slice(0, 50).map((snap) => (
              <motion.div key={snap.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between p-4 card">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{snap.file_name}</p>
                  <p className="text-xs text-[var(--color-text-muted)] font-mono truncate mt-0.5">{snap.sha256.slice(0, 16)}...</p>
                </div>
                <div className="flex items-center gap-3 ml-3">
                  <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold uppercase ${
                    snap.status === "ok" ? "bg-emerald-500/10 text-emerald-500" :
                    snap.status === "changed" ? "bg-amber-500/10 text-amber-500" :
                    "bg-red-500/10 text-red-400"
                  }`}>{snap.status}</span>
                  <span className="text-xs text-[var(--color-text-muted)]">{formatDate(snap.checked_at)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
