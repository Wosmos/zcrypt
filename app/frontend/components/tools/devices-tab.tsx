"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { listOfflinePins, pinFileOffline, unpinFileOffline, pushClipboard, listClipboard, getClipboardContent, deleteClipboardItem, createEventSource, listSyncFolders, createSyncFolder, updateSyncFolder, deleteSyncFolder } from "@/lib/api";
import { ensureFiles } from "@/store/files";
import { encryptChunk, decryptChunk, toBase64 } from "@/lib/crypto";
import type { OfflinePin, FileMetadata, ClipboardItem, SyncFolder } from "@/types";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Section } from "@/components/ui/section";
import { Separator } from "@/components/ui/separator";
import { SkeletonRow } from "@/components/ui/skeletons";
import { Trash2, Lock, Unlock } from "@/lib/icons";
import { cn, formatRelativeTime } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

const MAX_SIZE = 512 * 1024;

const inputClass =
  "h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none transition-all focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10";

function getDeviceId(): string {
  const key = "zcrypt-device-id";
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return id;
}

// ── Offline Pins Section ──────────────────────────────────────────────

function OfflinePinsSection() {
  const [pins, setPins] = useState<OfflinePin[]>([]);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinning, setPinning] = useState<string | null>(null);
  const deviceId = typeof window !== "undefined" ? getDeviceId() : "";

  useEffect(() => {
    Promise.all([listOfflinePins(deviceId), ensureFiles()])
      .then(([p, f]) => { setPins(p); setFiles(f); })
      .catch(() => {})
      .finally(() => setLoading(false));
    // deviceId is stable for the session; run once on mount.
  }, []);

  const isPinned = (fileId: string) => pins.some((p) => p.file_id === fileId);

  const handleTogglePin = async (fileId: string) => {
    setPinning(fileId);
    try {
      if (isPinned(fileId)) {
        await unpinFileOffline(fileId, deviceId);
        setPins((prev) => prev.filter((p) => p.file_id !== fileId));
      } else {
        const pin = await pinFileOffline(fileId, deviceId);
        setPins((prev) => [pin, ...prev]);
      }
    } catch { /* ignore */ }
    finally { setPinning(null); }
  };

  const pinnedFiles = files.filter((f) => isPinned(f.id));
  const unpinnedFiles = files.filter((f) => !isPinned(f.id));

  return (
    <Section
      title="Offline pins"
      description="Keep selected files available on this device without a connection."
      actions={
        deviceId ? (
          <span className="rounded-md bg-[var(--color-surface-1)] px-2 py-1 font-mono text-[11px] text-[var(--color-text-muted)]">
            {deviceId.slice(0, 8)}
          </span>
        ) : null
      }
    >
      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : files.length === 0 ? (
        <p className="py-2 text-sm text-[var(--color-text-muted)]">No files uploaded yet.</p>
      ) : (
        <div className="space-y-3">
          {pinnedFiles.length > 0 && (
            <div className="space-y-1">
              {pinnedFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Lock className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-accent)]" />
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">{file.original_name}</p>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => handleTogglePin(file.id)} disabled={pinning === file.id}>
                    <Unlock className="h-3.5 w-3.5" /> {pinning === file.id ? "..." : "Unpin"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {unpinnedFiles.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Available ({unpinnedFiles.length})</p>
              {unpinnedFiles.slice(0, 10).map((file) => (
                <div key={file.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] p-3">
                  <p className="min-w-0 flex-1 truncate text-sm text-[var(--color-text)]">{file.original_name}</p>
                  <Button variant="secondary" size="sm" onClick={() => handleTogglePin(file.id)} disabled={pinning === file.id}>
                    {pinning === file.id ? "..." : "Pin"}
                  </Button>
                </div>
              ))}
              {unpinnedFiles.length > 10 && <p className="text-center text-xs tabular-nums text-[var(--color-text-muted)]">+{unpinnedFiles.length - 10} more files</p>}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ── Clipboard Sync Section ────────────────────────────────────────────

function ClipboardSyncSection() {
  const reduceMotion = useReducedMotion();
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [decryptedCache, setDecryptedCache] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const keyRef = useRef<ArrayBuffer | null>(null);

  const getKey = useCallback(async (): Promise<ArrayBuffer> => {
    if (keyRef.current) return keyRef.current;
    let keyB64 = localStorage.getItem("zcrypt-clipboard-key");
    if (!keyB64) {
      const raw = crypto.getRandomValues(new Uint8Array(32));
      keyB64 = toBase64(raw);
      localStorage.setItem("zcrypt-clipboard-key", keyB64);
    }
    const binary = atob(keyB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    keyRef.current = bytes.buffer as ArrayBuffer;
    return keyRef.current;
  }, []);

  useEffect(() => {
    listClipboard().then(setItems).catch(() => {});
  }, []);

  // SSE for real-time sync
  useEffect(() => {
    const es = createEventSource();
    es.addEventListener("clipboard", (e: MessageEvent) => {
      try {
        const item = JSON.parse(e.data) as ClipboardItem;
        setItems((prev) => {
          if (prev.some((p) => p.id === item.id)) return prev;
          return [item, ...prev].slice(0, 30);
        });
      } catch { /* ignore */ }
    });
    return () => es.close();
  }, []);

  const handlePush = async () => {
    if (!input.trim()) return;
    setSending(true); setError("");
    try {
      const keyBytes = await getKey();
      const encoded = new TextEncoder().encode(input);
      if (encoded.length > MAX_SIZE) { setError("Content too large (max 512 KB)"); setSending(false); return; }
      const encrypted = await encryptChunk(keyBytes, encoded);
      const blob = toBase64(encrypted);
      let contentType: "text" | "link" | "image" = "text";
      if (/^https?:\/\/\S+$/i.test(input.trim())) contentType = "link";
      const result = await pushClipboard({ content_type: contentType, encrypted_blob: blob, content_size: encoded.length });
      setItems((prev) => [{ id: result.id, user_id: "", content_type: contentType, content_size: encoded.length, created_at: result.created_at }, ...prev].slice(0, 30));
      setDecryptedCache((prev) => ({ ...prev, [result.id]: input }));
      setInput("");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to sync"); }
    finally { setSending(false); }
  };

  const handleDecrypt = async (item: ClipboardItem) => {
    if (decryptedCache[item.id]) return;
    try {
      const keyBytes = await getKey();
      const { data } = await getClipboardContent(item.id);
      const decrypted = await decryptChunk(keyBytes, new Uint8Array(data));
      setDecryptedCache((prev) => ({ ...prev, [item.id]: new TextDecoder().decode(decrypted) }));
    } catch { setDecryptedCache((prev) => ({ ...prev, [item.id]: "[Decryption failed - different device key]" })); }
  };

  const handleCopy = async (id: string) => {
    const text = decryptedCache[id];
    if (!text) return;
    if (await copyToClipboard(text)) {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleDelete = async (id: string) => {
    try { await deleteClipboardItem(id); setItems((prev) => prev.filter((i) => i.id !== id)); } catch { /* ignore */ }
  };

  return (
    <Section title="Clipboard sync" description="End-to-end encrypted snippets that sync across your devices. Items auto-delete after 24h.">
      <div className="space-y-2">
        <textarea
          value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Paste or type content to sync across devices..."
          className={cn(inputClass, "h-24 resize-none py-2.5 font-mono")}
          maxLength={MAX_SIZE}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handlePush(); } }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs tabular-nums text-[var(--color-text-muted)]">{new TextEncoder().encode(input).length.toLocaleString()} / {MAX_SIZE.toLocaleString()} bytes</span>
          <Button onClick={handlePush} disabled={sending || !input.trim()} size="sm">
            {sending ? "Syncing..." : "Sync"}
          </Button>
        </div>
        {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
      </div>

      {items.length > 0 && (
        <div className="space-y-1">
          <AnimatePresence mode="popLayout" initial={false}>
            {items.slice(0, 10).map((item) => (
              <motion.div
                key={item.id}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2 rounded-xl border border-[var(--color-border)] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      item.content_type === "link" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                    )}>{item.content_type}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{formatRelativeTime(item.created_at)}</span>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {decryptedCache[item.id] ? (
                      <Button variant="ghost" size="sm" onClick={() => handleCopy(item.id)}>
                        {copiedId === item.id ? "Copied" : "Copy"}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => handleDecrypt(item)} className="text-[var(--color-accent)] hover:text-[var(--color-accent)]">
                        Decrypt
                      </Button>
                    )}
                    <IconButton icon={Trash2} label="Delete item" variant="danger" iconClassName="h-3.5 w-3.5" onClick={() => handleDelete(item.id)} />
                  </div>
                </div>
                {decryptedCache[item.id] && (
                  <pre className="max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded-lg bg-[var(--color-bg)] p-2 font-mono text-xs text-[var(--color-text)]">
                    {decryptedCache[item.id]}
                  </pre>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Section>
  );
}

// ── Folder Sync Section ───────────────────────────────────────────────

function FolderSyncSection() {
  const reduceMotion = useReducedMotion();
  const [folders, setFolders] = useState<SyncFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SyncFolder | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    listSyncFolders().then(setFolders).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!newPath.trim()) return;
    setCreating(true); setError("");
    try {
      const folder = await createSyncFolder({ folder_path: newPath.trim(), label: newLabel.trim() || undefined });
      setFolders((prev) => [folder, ...prev]);
      setNewPath(""); setNewLabel(""); setShowAdd(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to create"); }
    finally { setCreating(false); }
  };

  const handleToggle = async (folder: SyncFolder) => {
    try {
      await updateSyncFolder(folder.id, { enabled: !folder.enabled });
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, enabled: !f.enabled } : f)));
    } catch { /* ignore */ }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteSyncFolder(pendingDelete.id);
      setFolders((prev) => prev.filter((f) => f.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  return (
    <Section
      title="Folder sync"
      description="Managed by the zcrypt TUI — point it at local folders to back them up automatically."
      actions={
        <Button onClick={() => { setShowAdd(!showAdd); setError(""); }} size="sm" variant={showAdd ? "secondary" : "primary"}>
          {showAdd ? "Cancel" : "Add folder"}
        </Button>
      }
    >
      <AnimatePresence initial={false}>
        {showAdd && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 rounded-xl border border-[var(--color-border)] p-4">
              <input type="text" value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="/home/user/Documents" className={cn(inputClass, "font-mono")} />
              <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (optional)" className={inputClass} />
              {error && <p className="text-xs text-red-500" role="alert">{error}</p>}
              <Button onClick={handleCreate} disabled={creating || !newPath.trim()} className="w-full">
                {creating ? "Adding..." : "Add folder"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : folders.length === 0 && !showAdd ? (
        <p className="py-2 text-sm text-[var(--color-text-muted)]">No synced folders configured.</p>
      ) : folders.length > 0 ? (
        <div className="space-y-1">
          {folders.map((folder) => (
            <div key={folder.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-[var(--color-text)]">{folder.label || folder.folder_path}</span>
                  <span className={cn(
                    "flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    folder.enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                  )}>
                    {folder.enabled ? "Active" : "Paused"}
                  </span>
                </div>
                <p className="mt-0.5 truncate font-mono text-xs text-[var(--color-text-muted)]">{folder.folder_path}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleToggle(folder)}>
                  {folder.enabled ? "Pause" : "Resume"}
                </Button>
                <IconButton icon={Trash2} label="Remove folder" variant="danger" iconClassName="h-3.5 w-3.5" onClick={() => setPendingDelete(folder)} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
        Run <code className="rounded bg-[var(--color-surface-1)] px-1 py-0.5 font-mono text-[var(--color-accent)]">zcrypt sync</code> on each device to keep these folders in sync.
      </p>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        destructive
        title="Remove synced folder?"
        description={
          <>
            This stops syncing{pendingDelete ? <> &ldquo;{pendingDelete.label || pendingDelete.folder_path}&rdquo;</> : null}. Files already uploaded stay in your vault.
          </>
        }
        confirmLabel="Remove"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </Section>
  );
}

// ── Main Devices Tab ──────────────────────────────────────────────────

export function DevicesTab() {
  return (
    <div className="panel space-y-6 p-6">
      <OfflinePinsSection />
      <Separator className="bg-[var(--color-border)]" />
      <ClipboardSyncSection />
      <Separator className="bg-[var(--color-border)]" />
      <FolderSyncSection />
    </div>
  );
}
