/**
 * Public folder link (zero-knowledge). Mirrors the single-file share: one random
 * folder-share key is generated in the browser and each file's CEK is re-wrapped
 * under it. The key lives only in the returned URL #fragment and never reaches
 * the server — so anyone with the link can open the folder, no account needed,
 * while the server only ever stores opaque per-file envelopes.
 *
 * The recipient's "Download all" rebuilds the EXACT folder tree as a single zip.
 * The per-file relative paths that make that possible are also carried in the
 * #fragment (a compact, gzipped manifest) — never sent to the server — because
 * folder names are E2E-encrypted and the server can't reconstruct them.
 */
import { generateCEK, resolveFileKey, wrapKey, toBase64, fromBase64 } from "@/lib/crypto";
import { createFolderShare, getFileMeta, listFolderSubtree } from "@/lib/api";
import { deriveNameKey, decryptNameSafe } from "@/lib/name-crypto";
import { usePassphraseStore } from "@/store/passphrase";

export interface FolderShareOptions {
  password?: string;
  expiresHours?: number;
  maxDownloads?: number;
}

/** Neutralize a decrypted name so it's safe as a single zip path segment — no
 *  separators, no traversal. */
function sanitizeSegment(name: string): string {
  const s = name.replace(/[/\\]/g, "_").trim();
  return s === "" || s === "." || s === ".." ? "_" : s;
}

/**
 * Return folderId -> relative directory path from the shared root (the root
 * itself maps to ""). The whole subtree is fetched in ONE request so a branch
 * can never be silently dropped by a failed per-folder fetch (which used to
 * flatten deep files in the recipient's zip). Folder names are decrypted
 * client-side, so paths are only ever assembled in the browser. Throws if the
 * subtree can't be loaded — the caller then falls back to a flat zip and warns,
 * rather than emitting a silently half-nested one.
 */
async function buildFolderPaths(rootId: string, nameKey: CryptoKey): Promise<Map<string, string>> {
  const all = await listFolderSubtree(rootId); // single, complete, atomic

  // Index children by parent so we can walk the tree entirely in memory.
  const childrenOf = new Map<string, typeof all>();
  for (const f of all) {
    if (f.id === rootId) continue;
    const key = f.parent_id ?? "";
    const arr = childrenOf.get(key);
    if (arr) arr.push(f);
    else childrenOf.set(key, [f]);
  }

  const paths = new Map<string, string>([[rootId, ""]]);
  let frontier = [rootId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const pid of frontier) {
      const parentPath = paths.get(pid) ?? "";
      for (const f of childrenOf.get(pid) ?? []) {
        if (paths.has(f.id)) continue;
        const seg = sanitizeSegment(await decryptNameSafe(f.encrypted_name, nameKey));
        paths.set(f.id, parentPath ? `${parentPath}/${seg}` : seg);
        next.push(f.id);
      }
    }
    frontier = next;
  }
  return paths;
}

/**
 * Create a public link for a folder's files. `files` is the set of files to
 * include (the caller gathers the folder's subtree). Files whose CEK can't be
 * recovered with the vault passphrase (legacy files, or files inside a
 * password-protected folder) are skipped. Returns the shareable URL (key +
 * path-manifest in the fragment) plus how many files were shared vs. skipped.
 * Requires an unlocked vault.
 */
export async function createFolderShareLink(
  folderId: string | null,
  name: string,
  files: { id: string; folder_id?: string | null; original_name?: string }[],
  opts: FolderShareOptions = {}
): Promise<{ url: string; token: string; shared: number; skipped: number; nestingIncomplete: boolean }> {
  const passphrase = usePassphraseStore.getState().getPassphrase();
  if (!passphrase) throw new Error("Unlock your vault to share a folder.");
  if (files.length === 0) throw new Error("This folder has no files to share.");

  const folderKey = generateCEK();
  const folderKeyBuf = folderKey.buffer.slice(0) as ArrayBuffer;

  // Map each subfolder to its relative path so the recipient's zip mirrors the
  // exact cloud tree. Needs the name key (folder names are E2E-encrypted). If the
  // subtree can't be loaded we leave paths off (flat zip) and flag it so the
  // caller can warn — never a silently half-nested link.
  let folderPaths: Map<string, string> | null = null;
  let pathBuildFailed = false;
  try {
    // Imported lazily so this module stays free of load-time store side effects
    // (the auth store reads localStorage at creation).
    const { useAuthStore } = await import("@/store/auth");
    const userId = useAuthStore.getState().user?.id;
    if (folderId && userId) {
      const nameKey = await deriveNameKey(passphrase, userId);
      folderPaths = await buildFolderPaths(folderId, nameKey);
    }
  } catch {
    pathBuildFailed = true;
    folderPaths = null;
  }

  const wraps: { file_id: string; wrapped_cek: string }[] = [];
  const manifest: Record<string, string> = {}; // file_id -> relative directory (subfolder files only)
  let skipped = 0;
  for (const f of files) {
    try {
      const meta = await getFileMeta(f.id);
      if (!meta.wrapped_cek) {
        skipped++; // legacy file (no envelope) — can't be link-shared
        continue;
      }
      // Recover the file's CEK with the owner's passphrase, then re-wrap it under
      // the folder-share key so a recipient can decrypt with just the link.
      const cekBuf = await resolveFileKey(passphrase, fromBase64(meta.salt), meta.wrapped_cek);
      const wrapped = await wrapKey(folderKeyBuf, new Uint8Array(cekBuf));
      wraps.push({ file_id: f.id, wrapped_cek: toBase64(wrapped) });

      // Record the directory only when the file sits in a subfolder; files in the
      // shared root fall back to their filename on the recipient side.
      const dir = folderPaths?.get(f.folder_id ?? "") ?? "";
      if (dir) manifest[f.id] = dir;
    } catch {
      skipped++; // e.g. protected-folder file whose CEK is under the folder password
    }
  }
  if (wraps.length === 0) {
    throw new Error(
      "None of this folder's files could be shared — they may be in a password-protected folder, or were uploaded before sharing was supported."
    );
  }

  const { token } = await createFolderShare({
    folder_id: folderId ?? undefined,
    name,
    files: wraps,
    password: opts.password || undefined,
    expires_in_hours: opts.expiresHours || undefined,
    max_downloads: opts.maxDownloads || undefined,
  });

  let url = `${window.location.origin}/f/${token}#key=${toBase64(folderKey)}`;
  // Carry the subfolder layout in the fragment (client-only, never hits the
  // server). Gzipped so deep trees stay URL-friendly.
  if (Object.keys(manifest).length > 0) {
    try {
      const { gzipSync, strToU8 } = await import("fflate");
      const packed = gzipSync(strToU8(JSON.stringify(manifest)));
      url += `&paths=${toBase64(packed)}`;
    } catch {
      // Omit on failure — the recipient's zip falls back to a flat layout.
    }
  }

  // The share HAS subfolder files but we couldn't build the layout — the link
  // works, but its download will be flat. Let the caller warn so the user can
  // recreate it rather than unknowingly share a flattened folder.
  const hasSubfolderFiles = files.some((f) => f.folder_id && f.folder_id !== folderId);
  const nestingIncomplete = pathBuildFailed && hasSubfolderFiles;

  return { url, token, shared: wraps.length, skipped, nestingIncomplete };
}
