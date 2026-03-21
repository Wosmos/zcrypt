"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { listOfflinePins, pinFileOffline, unpinFileOffline, listFiles, pushClipboard, listClipboard, getClipboardContent, deleteClipboardItem, createEventSource, listSyncFolders, createSyncFolder, updateSyncFolder, deleteSyncFolder } from "@/lib/api";
import { encryptChunk, decryptChunk, toBase64 } from "@/lib/crypto";
import type { OfflinePin, FileMetadata, ClipboardItem, SyncFolder } from "@/types";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { HardDrive, Copy, RefreshCw } from "@/lib/icons";

const MAX_SIZE = 512 * 1024;

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
    Promise.all([listOfflinePins(deviceId), listFiles()])
      .then(([p, f]) => { setPins(p); setFiles(f); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (loading) {
    return <div className="flex items-center justify-center py-8"><LogoSpinner size="sm" speed="fast" /></div>;
  }

  const pinnedFiles = files.filter((f) => isPinned(f.id));
  const unpinnedFiles = files.filter((f) => !isPinned(f.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-[var(--color-text-muted)]" />
          <h3 className="text-sm font-semibold">Offline Pins</h3>
        </div>
        <span className="text-xs text-[var(--color-text-muted)]">Device: {deviceId.slice(0, 8)}...</span>
      </div>

      {pinnedFiles.length > 0 && (
        <div className="space-y-1">
          {pinnedFiles.map((file) => (
            <div key={file.id} className="flex items-center justify-between p-3 card">
              <p className="text-sm font-medium truncate flex-1">{file.original_name}</p>
              <Button variant="danger" size="sm" onClick={() => handleTogglePin(file.id)} disabled={pinning === file.id}>
                {pinning === file.id ? "..." : "Unpin"}
              </Button>
            </div>
          ))}
        </div>
      )}

      {unpinnedFiles.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-[var(--color-text-muted)]">Available ({unpinnedFiles.length})</p>
          {unpinnedFiles.slice(0, 10).map((file) => (
            <div key={file.id} className="flex items-center justify-between p-3 card">
              <p className="text-sm truncate flex-1">{file.original_name}</p>
              <Button variant="secondary" size="sm" onClick={() => handleTogglePin(file.id)} disabled={pinning === file.id}>
                {pinning === file.id ? "..." : "Pin"}
              </Button>
            </div>
          ))}
          {unpinnedFiles.length > 10 && <p className="text-xs text-[var(--color-text-muted)] text-center">+{unpinnedFiles.length - 10} more files</p>}
        </div>
      )}

      {files.length === 0 && <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No files uploaded yet.</p>}
    </div>
  );
}

// ── Clipboard Sync Section ────────────────────────────────────────────

function ClipboardSyncSection() {
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
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string) => {
    try { await deleteClipboardItem(id); setItems((prev) => prev.filter((i) => i.id !== id)); } catch { /* ignore */ }
  };

  const formatTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "just now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return new Date(iso).toLocaleDateString();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Copy className="h-4 w-4 text-[var(--color-text-muted)]" />
        <h3 className="text-sm font-semibold">Clipboard Sync</h3>
      </div>

      <div className="space-y-2">
        <textarea
          value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Paste or type content to sync across devices..."
          className="w-full h-24 px-3.5 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40 resize-none font-mono"
          maxLength={MAX_SIZE}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handlePush(); } }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--color-text-muted)]">{new TextEncoder().encode(input).length.toLocaleString()} / {MAX_SIZE.toLocaleString()} bytes</span>
          <Button onClick={handlePush} disabled={sending || !input.trim()} size="sm">
            {sending ? "Syncing..." : "Sync"}
          </Button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {items.length > 0 && (
        <div className="space-y-1">
          <AnimatePresence mode="popLayout">
            {items.slice(0, 10).map((item) => (
              <motion.div key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="p-3 card space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${item.content_type === "link" ? "bg-blue-500/10 text-blue-400" : "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"}`}>{item.content_type}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{formatTime(item.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {decryptedCache[item.id] ? (
                      <button onClick={() => handleCopy(item.id)} className="text-xs px-2 py-1 rounded-md hover:bg-[var(--color-border)] transition-colors text-[var(--color-text-secondary)]">
                        {copiedId === item.id ? "Copied" : "Copy"}
                      </button>
                    ) : (
                      <button onClick={() => handleDecrypt(item)} className="text-xs px-2 py-1 rounded-md hover:bg-[var(--color-border)] transition-colors text-[var(--color-accent)]">Decrypt</button>
                    )}
                    <button onClick={() => handleDelete(item.id)} className="text-xs px-2 py-1 rounded-md hover:bg-red-500/10 transition-colors text-red-400">Delete</button>
                  </div>
                </div>
                {decryptedCache[item.id] && (
                  <pre className="text-xs text-[var(--color-text)] whitespace-pre-wrap break-all font-mono bg-[var(--color-bg)] rounded-lg p-2 max-h-24 overflow-y-auto">
                    {decryptedCache[item.id]}
                  </pre>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
        End-to-end encrypted. Each device has its own key. Items auto-delete after 24h.
      </p>
    </div>
  );
}

// ── Folder Sync Section ───────────────────────────────────────────────

function FolderSyncSection() {
  const [folders, setFolders] = useState<SyncFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

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

  const handleDelete = async (id: string) => {
    try { await deleteSyncFolder(id); setFolders((prev) => prev.filter((f) => f.id !== id)); } catch { /* ignore */ }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><LogoSpinner size="sm" speed="fast" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-[var(--color-text-muted)]" />
          <h3 className="text-sm font-semibold">Folder Sync</h3>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)} size="sm" variant={showAdd ? "secondary" : "primary"}>
          {showAdd ? "Cancel" : "Add Folder"}
        </Button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="p-4 card space-y-3">
              <input type="text" value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="/home/user/Documents"
                className="w-full h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40 font-mono" />
              <input type="text" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Label (optional)"
                className="w-full h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40" />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <Button onClick={handleCreate} disabled={creating || !newPath.trim()} className="w-full">
                {creating ? "Adding..." : "Add Folder"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {folders.length === 0 && !showAdd ? (
        <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No synced folders configured.</p>
      ) : (
        <div className="space-y-1">
          {folders.map((folder) => (
            <div key={folder.id} className="p-3 card">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{folder.label || folder.folder_path}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${folder.enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-[var(--color-text-muted)]/10 text-[var(--color-text-muted)]"}`}>
                      {folder.enabled ? "Active" : "Paused"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] font-mono truncate mt-0.5">{folder.folder_path}</p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button onClick={() => handleToggle(folder)} className="text-xs px-2 py-1 rounded-md hover:bg-[var(--color-border)] transition-colors text-[var(--color-text-secondary)]">
                    {folder.enabled ? "Pause" : "Resume"}
                  </button>
                  <button onClick={() => handleDelete(folder.id)} className="text-xs px-2 py-1 rounded-md hover:bg-red-500/10 transition-colors text-red-400">Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
        Managed by the zcrypt TUI. Run <code className="text-[var(--color-accent)]">zcrypt sync</code> on each device.
      </p>
    </div>
  );
}

// ── Main Devices Tab ──────────────────────────────────────────────────

export function DevicesTab() {
  return (
    <div className="space-y-6">
      <OfflinePinsSection />
      <div className="border-t border-[var(--color-border)]" />
      <ClipboardSyncSection />
      <div className="border-t border-[var(--color-border)]" />
      <FolderSyncSection />
    </div>
  );
}
