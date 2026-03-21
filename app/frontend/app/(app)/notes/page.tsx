"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { listNotes, createNote, updateNote, deleteNote } from "@/lib/api";
import type { Note } from "@/types";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { FileText, Plus, Trash2, Star } from "@/lib/icons";

const NOTES_KEY_STORAGE = "zcrypt-notes-key";

async function getOrCreateKey(): Promise<CryptoKey> {
  let raw = localStorage.getItem(NOTES_KEY_STORAGE);
  if (!raw) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    raw = btoa(String.fromCharCode(...bytes));
    localStorage.setItem(NOTES_KEY_STORAGE, raw);
  }
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptText(text: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  const combined = new Uint8Array(iv.length + new Uint8Array(enc).length);
  combined.set(iv);
  combined.set(new Uint8Array(enc), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptText(b64: string): Promise<string> {
  try {
    const key = await getOrCreateKey();
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const iv = data.slice(0, 12);
    const cipher = data.slice(12);
    const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return new TextDecoder().decode(dec);
  } catch {
    return "[decryption failed]";
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

  const loadNotes = useCallback(async () => {
    try {
      const raw = await listNotes();
      const decrypted = await Promise.all(
        raw.map(async (n: Note) => ({
          id: n.id,
          title: n.encrypted_title ? await decryptText(n.encrypted_title) : "",
          body: n.encrypted_body ? await decryptText(n.encrypted_body) : "",
          tags: n.tags || [],
          pinned: n.pinned,
          created_at: n.created_at,
          updated_at: n.updated_at,
        }))
      );
      setNotes(decrypted);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      const encTitle = await encryptText(title);
      const encBody = await encryptText(body);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LogoSpinner size="md" speed="fast" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-surface-1)] ring-1 ring-[var(--color-border)]">
            <FileText className="h-5 w-5 text-[var(--color-text-muted)]" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-widest">Encrypted</p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Secure Notes</h1>
          </div>
        </div>
        <Button onClick={handleNew} size="sm">
          <Plus className="h-3.5 w-3.5" />
          New Note
        </Button>
      </div>

      <div className="flex gap-4 h-[calc(100vh-14rem)]">
        {/* Note list */}
        <div className="w-72 flex-shrink-0 flex flex-col card overflow-hidden p-0">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <p className="text-xs font-semibold text-[var(--color-text-muted)]">{notes.length} note{notes.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {notes.length === 0 && !isNew && (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No notes yet</p>
            )}
            <AnimatePresence>
              {notes.map((note) => (
                <motion.button
                  key={note.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => selectNote(note)}
                  className={`w-full text-left p-3 rounded-xl transition-all ${
                    selectedId === note.id
                      ? "bg-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)]/30"
                      : "hover:bg-[var(--color-surface-1)]"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {note.pinned && <Star className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                    <p className="text-sm font-medium truncate">{note.title || "Untitled"}</p>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] truncate mt-0.5">{note.body.slice(0, 60)}</p>
                  {note.tags.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {note.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 bg-[var(--color-surface-1)] rounded text-[var(--color-text-muted)]">
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

        {/* Editor */}
        <div className="flex-1 card overflow-hidden p-0 flex flex-col">
          {!isNew && !selectedId ? (
            <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
              Select a note or create a new one
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
                className="flex-1 px-5 py-4 bg-transparent placeholder:text-[var(--color-text-muted)] focus:outline-none resize-none font-mono text-sm leading-relaxed"
              />
              <div className="flex items-center gap-3 px-5 py-3 border-t border-[var(--color-border)]">
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Tags (comma separated)"
                  className="flex-1 h-9 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40"
                />
                <Button onClick={handleSave} disabled={saving} size="sm">
                  {saving ? "Saving..." : "Save"}
                </Button>
                {selectedId && (
                  <Button variant="danger" size="sm" onClick={() => handleDelete(selectedId)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
