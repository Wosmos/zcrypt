"use client";

import { Music, Video, Play } from "@/lib/icons";
import { MediaPlayer } from "@/components/ui/media-player";
import { getFileTypeInfo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { FileMetadata } from "@/types";

export interface MediaTrack {
  /** Index into the parent FileViewer's `files` list. */
  index: number;
  file: FileMetadata;
}

/**
 * Audio/Video viewer that REUSES `components/ui/media-player.tsx` for transport,
 * scrubber and volume, and adds a playlist of the other media files in the
 * current folder. Selecting a track calls `onSelectTrack(index)` so the parent
 * <FileViewer> navigates to it (decrypting on demand) — the player itself stays
 * single-source, exactly as built. Keyed by `src` upstream so switching tracks
 * remounts cleanly and the old blob URL is revoked by the parent.
 */
export function MediaViewer({
  src,
  filename,
  mime,
  kind,
  tracks,
  currentIndex,
  onSelectTrack,
}: {
  src: string;
  filename: string;
  mime?: string;
  kind: "audio" | "video";
  tracks: MediaTrack[];
  currentIndex: number;
  onSelectTrack: (index: number) => void;
}) {
  const hasPlaylist = tracks.length > 1;

  return (
    <div
      className={cn(
        "flex h-full w-full gap-4",
        hasPlaylist ? "flex-col lg:flex-row" : "flex-col"
      )}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="w-full max-w-2xl">
          {/* key by src so the player remounts on track change */}
          <MediaPlayer key={src} src={src} filename={filename} mime={mime} kind={kind} />
        </div>
      </div>

      {hasPlaylist && (
        <aside className="flex max-h-full w-full shrink-0 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] lg:w-72">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2.5 text-xs font-semibold text-[var(--color-text-secondary)]">
            {kind === "video" ? (
              <Video className="h-4 w-4" />
            ) : (
              <Music className="h-4 w-4" />
            )}
            Playlist
            <span className="ml-auto tabular-nums text-[var(--color-text-muted)]">
              {tracks.length}
            </span>
          </div>
          <ul className="min-h-0 flex-1 overflow-auto p-1.5">
            {tracks.map((track) => {
              const active = track.index === currentIndex;
              const info = getFileTypeInfo(track.file.original_name);
              return (
                <li key={track.file.id}>
                  <button
                    type="button"
                    onClick={() => onSelectTrack(track.index)}
                    aria-current={active}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                      active
                        ? "bg-[var(--color-accent)]/10 text-[var(--color-text)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                        active ? "bg-cyan-500/20 text-cyan-500" : info.bg
                      )}
                    >
                      {active ? (
                        <Play className="h-3.5 w-3.5" />
                      ) : kind === "video" ? (
                        <Video className={cn("h-3.5 w-3.5", info.color)} />
                      ) : (
                        <Music className={cn("h-3.5 w-3.5", info.color)} />
                      )}
                    </span>
                    <span className="truncate">{track.file.original_name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      )}
    </div>
  );
}
