import type { IncompleteUpload } from "@/lib/api";
import { isTauri } from "@/lib/tauri";
import { uploadPathFor } from "@/lib/desktop-paths";
import { peekName } from "@/lib/file-names";
import { LOCKED } from "@/lib/sealed";

// Whether an unfinished upload was started on THIS device. Desktop remembers
// each source path; the browser keeps a resume pointer (zc_upl:*, see
// store/upload.ts) carrying the session id. Uploads from other devices can't be
// resumed here without hunting for the file, so they stay off this device's list.
export function startedOnThisDevice(u: IncompleteUpload): boolean {
  if (isTauri) return uploadPathFor(u.filename) !== undefined;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("zc_upl:")) continue;
      const rec = JSON.parse(localStorage.getItem(key) as string) as { sessionId?: string } | null;
      if (rec?.sessionId === u.session_id) return true;
    }
  } catch {
    // Storage unreadable: fall through and hide it rather than show a dead row.
  }
  return false;
}

/** Sealed sessions carry only `encrypted_name`; fill `filename` from the shared name maps.
 *  `_epoch` is unused: reactive callers pass the names epoch so the result updates. */
export function resolveUploadNames(
  raw: IncompleteUpload[],
  unlocked: boolean,
  _epoch?: number,
): IncompleteUpload[] {
  return raw.map((u) => {
    if (u.filename || !u.encrypted_name) return u;
    return { ...u, filename: unlocked ? (peekName(u.encrypted_name) ?? "") : LOCKED };
  });
}
