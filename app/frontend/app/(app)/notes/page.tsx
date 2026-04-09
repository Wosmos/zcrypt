"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { listNotes, createNote, updateNote, deleteNote } from "@/lib/api";
import type { Note } from "@/types";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { cn } from "@/lib/utils";
import { deriveKeyBytes } from "@/lib/crypto";
import { usePassphraseStore } from "@/store/passphrase";
import { useAuthStore } from "@/store/auth";
import { PassphraseModal } from "@/components/ui/passphrase-modal";
import {
  FileText,
  Plus,
  Trash2,
  Star,
  ArrowLeft,
  Lock,
  Search,
} from "@/lib/icons";

const LEGACY_KEY_STORAGE = "zcrypt-notes-key";

async function deriveNotesKey(passphrase: string, userId: string): Promise<CryptoKey> {
  const salt = new TextEncoder().encode("zcrypt-notes-" + userId);
  const keyBytes = await deriveKeyBytes(passphrase, salt);
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function getLegacyKey(): Promise<CryptoKey | null> {
  const raw = localStorage.getItem(LEGACY_KEY_STORAGE);
  if (!raw) return null;
  try {
    const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

async function encryptText(text: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  const combined = new Uint8Array(iv.length + new Uint8Array(enc).length);
  combined.set(iv);
  combined.set(new Uint8Array(enc), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptText(b64: string, key: CryptoKey): Promise<string> {
  const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = data.slice(0, 12);
  const cipher = data.slice(12);
  const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(dec);
}

async function decryptWithFallback(
  b64: string,
  primaryKey: CryptoKey,
  legacyKey: CryptoKey | null,
): Promise<{ text: string; usedLegacy: boolean }> {
  try {
    return { text: await decryptText(b64, primaryKey), usedLegacy: false };
  } catch {
    if (legacyKey) {
      try {
        return { text: await decryptText(b64, legacyKey), usedLegacy: true };
      } catch {
        // Both keys failed
      }
    }
    return { text: "[decryption failed]", usedLegacy: false };
  }
}

interface DecryptedNote {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export default function NotesPage() {
  const [notes, setNotes] = useState<DecryptedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPassphraseModal, setShowPassphraseModal] = useState(false);
  const [passphraseError, setPassphraseError] = useState<string | null>(null);

  const notesKeyRef = useRef<CryptoKey | null>(null);
  const user = useAuthStore((s) => s.user);
  const { getPassphrase } = usePassphraseStore();

  // On mobile, track whether we're viewing the list or the editor
  const showEditor = isNew || !!selectedId;

  const loadNotes = useCallback(async (key?: CryptoKey) => {
    const notesKey = key || notesKeyRef.current;
    if (!notesKey) return;

    try {
      const raw = await listNotes();
      const legacyKey = await getLegacyKey();
      const needsMigrationIds: string[] = [];

      const decrypted = await Promise.all(
        raw.map(async (n: Note) => {
          let titleResult = { text: "", usedLegacy: false };
          let bodyResult = { text: "", usedLegacy: false };

          if (n.encrypted_title) {
            titleResult = await decryptWithFallback(n.encrypted_title, notesKey, legacyKey);
          }
          if (n.encrypted_body) {
            bodyResult = await decryptWithFallback(n.encrypted_body, notesKey, legacyKey);
          }

          if (titleResult.usedLegacy || bodyResult.usedLegacy) {
            needsMigrationIds.push(n.id);
          }

          return {
            id: n.id,
            title: titleResult.text,
            body: bodyResult.text,
            tags: n.tags || [],
            pinned: n.pinned,
            created_at: n.created_at,
            updated_at: n.updated_at,
          };
        })
      );

      setNotes(decrypted);

      // Migrate legacy notes in background — re-encrypt with passphrase-derived key
      if (needsMigrationIds.length > 0) {
        for (const note of decrypted) {
          if (!needsMigrationIds.includes(note.id)) continue;
          if (note.title === "[decryption failed]" || note.body === "[decryption failed]") continue;
          try {
            const encTitle = await encryptText(note.title, notesKey);
            const encBody = await encryptText(note.body, notesKey);
            await updateNote(note.id, {
              encrypted_title: encTitle,
              encrypted_body: encBody,
              content_size: new TextEncoder().encode(note.body).length,
              tags: note.tags,
            });
          } catch {
            // Will retry migration next load
          }
        }
        localStorage.removeItem(LEGACY_KEY_STORAGE);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize: check for cached passphrase or prompt
  useEffect(() => {
    if (!user) return;
    const cached = getPassphrase();
    if (cached) {
      deriveNotesKey(cached, user.id).then((key) => {
        notesKeyRef.current = key;
        loadNotes(key);
      });
    } else {
      setLoading(false);
      setShowPassphraseModal(true);
    }
  }, [user, getPassphrase, loadNotes]);

  const handlePassphraseConfirm = async (passphrase: string) => {
    if (!user) return;
    try {
      const key = await deriveNotesKey(passphrase, user.id);
      notesKeyRef.current = key;
      setShowPassphraseModal(false);
      setPassphraseError(null);
      setLoading(true);
      await loadNotes(key);
    } catch {
      setPassphraseError("Failed to derive encryption key");
    }
  };

  const selectNote = (note: DecryptedNote) => {
    setSelectedId(note.id);
    setTitle(note.title);
    setBody(note.body);
    setTags(note.tags.join(", "));
    setIsNew(false);
  };

  const handleNew = () => {
    setSelectedId(null);
    setTitle("");
    setBody("");
    setTags("");
    setIsNew(true);
  };

  const handleBack = () => {
    setSelectedId(null);
    setIsNew(false);
  };

  const handleSave = async () => {
    const key = notesKeyRef.current;
    if (!key) {
      setShowPassphraseModal(true);
      return;
    }

    setSaving(true);
    try {
      const encTitle = await encryptText(title, key);
      const encBody = await encryptText(body, key);
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);

      if (isNew) {
        await createNote({
          encrypted_title: encTitle,
          encrypted_body: encBody,
          content_size: new TextEncoder().encode(body).length,
          tags: tagList,
        });
      } else if (selectedId) {
        await updateNote(selectedId, {
          encrypted_title: encTitle,
          encrypted_body: encBody,
          content_size: new TextEncoder().encode(body).length,
          tags: tagList,
        });
      }
      await loadNotes();
      if (isNew) setIsNew(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    try {
      await deleteNote(id);
      if (selectedId === id) {
        setSelectedId(null);
        setIsNew(false);
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      // ignore
    }
  };

  const filteredNotes = searchQuery
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : notes;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LogoSpinner size="md" speed="fast" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PassphraseModal
        open={showPassphraseModal}
        onConfirm={handlePassphraseConfirm}
        onClose={() => setShowPassphraseModal(false)}
        title="Unlock Notes"
        subtitle="Enter your encryption passphrase to access notes"
        confirmLabel="Unlock"
        error={passphraseError}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* On mobile, show back arrow when viewing editor */}
          {showEditor && (
            <button
              onClick={handleBack}
              className="md:hidden flex items-center justify-center h-10 w-10 -ml-1 rounded-xl hover:bg-[var(--color-surface-1)] transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-[var(--color-text-muted)]" />
            </button>
          )}
          <div className={cn("flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-surface-1)] ring-1 ring-[var(--color-border)]", showEditor && "hidden md:flex")}>
            <FileText className="h-5 w-5 text-[var(--color-text-muted)]" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-widest">Encrypted</p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">
              {showEditor ? (title || "New Note") : "Secure Notes"}
            </h1>
          </div>
        </div>
        {!showEditor && (
          <Button onClick={handleNew} size="sm">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">New Note</span>
          </Button>
        )}
      </div>

      {/* Desktop: side-by-side / Mobile: list OR editor */}
      <div className="flex gap-4 md:h-[calc(100vh-14rem)]">
        {/* Note list — hidden on mobile when editor is open */}
        <div className={cn(
          "flex flex-col card overflow-hidden p-0 w-full md:w-72 md:flex-shrink-0",
          showEditor ? "hidden md:flex" : "flex"
        )}>
          {/* Search */}
          <div className="px-3 py-2.5 border-b border-[var(--color-border)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-text-muted)]" />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-[var(--color-surface-1)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/30 transition-shadow"
              />
            </div>
          </div>

          <div className="px-3 py-2 border-b border-[var(--color-border)]">
            <p className="text-xs font-semibold text-[var(--color-text-muted)]">
              {filteredNotes.length} note{filteredNotes.length !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredNotes.length === 0 && !isNew && (
              <EmptyNotes onNew={handleNew} hasSearch={!!searchQuery} />
            )}
            <AnimatePresence>
              {filteredNotes.map((note) => (
                <motion.button
                  key={note.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => selectNote(note)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl transition-all",
                    selectedId === note.id
                      ? "bg-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)]/30"
                      : "hover:bg-[var(--color-surface-1)] active:scale-[0.98]"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {note.pinned && <Star className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                    <p className="text-sm font-medium truncate flex-1">{note.title || "Untitled"}</p>
                    <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">
                      {formatDate(note.updated_at)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] truncate mt-0.5">{note.body.slice(0, 80)}</p>
                  {note.tags.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {note.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 bg-[var(--color-surface-1)] rounded-md text-[var(--color-text-muted)]">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Editor — full width on mobile, flex-1 on desktop */}
        <div className={cn(
          "flex-1 card overflow-hidden p-0 flex flex-col",
          !showEditor ? "hidden md:flex" : "flex"
        )}>
          {!isNew && !selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-3 p-8">
              <div className="h-16 w-16 rounded-2xl bg-[var(--color-surface-1)] flex items-center justify-center">
                <FileText className="h-7 w-7" />
              </div>
              <p className="text-sm">Select a note or create a new one</p>
              <Button onClick={handleNew} size="sm" variant="ghost">
                <Plus className="h-3.5 w-3.5" />
                New Note
              </Button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title..."
                className="text-lg font-bold px-5 py-4 bg-transparent placeholder:text-[var(--color-text-muted)] focus:outline-none border-b border-[var(--color-border)]"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your note..."
                className="flex-1 min-h-[40vh] md:min-h-0 px-5 py-4 bg-transparent placeholder:text-[var(--color-text-muted)] focus:outline-none resize-none font-mono text-sm leading-relaxed"
              />
              <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-3 px-4 py-3 border-t border-[var(--color-border)]">
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Tags (comma separated)"
                  className="flex-1 h-9 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40"
                />
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saving} size="sm" className="flex-1 xs:flex-none">
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  {selectedId && (
                    <Button variant="danger" size="sm" onClick={() => handleDelete(selectedId)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyNotes({ onNew, hasSearch }: { onNew: () => void; hasSearch: boolean }) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="h-12 w-12 rounded-2xl bg-[var(--color-surface-1)] flex items-center justify-center mb-3">
          <Search className="h-5 w-5 text-[var(--color-text-muted)]" />
        </div>
        <p className="text-sm font-medium text-[var(--color-text-secondary)]">No matching notes</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">Try a different search term</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="relative mb-4">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[var(--color-accent)]/10 to-[var(--color-accent)]/5 flex items-center justify-center ring-1 ring-[var(--color-accent)]/20">
          <FileText className="h-7 w-7 text-[var(--color-accent)]" />
        </div>
        <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-lg bg-[var(--color-surface)] ring-1 ring-[var(--color-border)] flex items-center justify-center">
          <Lock className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
        </div>
      </div>
      <p className="text-sm font-semibold">No notes yet</p>
      <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-[200px] leading-relaxed">
        Your notes are encrypted end-to-end. Only you can read them.
      </p>
      <Button onClick={onNew} size="sm" className="mt-4">
        <Plus className="h-3.5 w-3.5" />
        Create your first note
      </Button>
    </div>
  );
}
