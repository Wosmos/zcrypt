"use client";

import { useState } from "react";
import { Music, Video, Play, X } from "@/lib/icons";
import { MediaPlayer } from "@/components/ui/media-player";
import { mediaKindFor } from "@/lib/media-formats";
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
  poster,
  tracks,
  currentIndex,
  onSelectTrack,
}: {
  src: string;
  filename: string;
  mime?: string;
  kind: "audio" | "video";
  poster?: string;
  tracks: MediaTrack[];
  currentIndex: number;
  onSelectTrack: (index: number) => void;
}) {
  const hasPlaylist = tracks.length > 1;
  // The playlist is an overlay DRAWER — a bottom sheet on mobile, a right-side
  // drawer on desktop — opened on demand so the player always gets the full area
  // and the list scrolls inside the drawer instead of crushing the player.
  const [playlistOpen, setPlaylistOpen] = useState(false);

  // Playlist filter — only offered when the folder actually mixes both kinds.
  const [filter, setFilter] = useState<"all" | "audio" | "video">("all");
  const kindOf = (t: MediaTrack): "audio" | "video" =>
    mediaKindFor(t.file.original_name) ?? "audio";
  const hasAudio = tracks.some((t) => kindOf(t) === "audio");
  const hasVideo = tracks.some((t) => kindOf(t) === "video");
  const canFilter = hasAudio && hasVideo;
  const shownTracks =
    canFilter && filter !== "all" ? tracks.filter((t) => kindOf(t) === filter) : tracks;

  // Previous / next TRACK navigation, walking the currently-shown (filtered)
  // list so next/prev stays within the Audio/Video choice. Falls back to the
  // full list if the active track was filtered out of view.
  const navList = shownTracks.some((t) => t.index === currentIndex) ? shownTracks : tracks;
  const navPos = navList.findIndex((t) => t.index === currentIndex);
  const onPrev =
    navPos > 0 ? () => onSelectTrack(navList[navPos - 1].index) : undefined;
  const onNext =
    navPos >= 0 && navPos < navList.length - 1
      ? () => onSelectTrack(navList[navPos + 1].index)
      : undefined;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      {/* Player — always centered and full-area; the drawer overlays it. */}
      <div className="flex h-full w-full max-w-2xl items-center justify-center overflow-y-auto">
        {/* key by src so the player remounts on track change */}
        <MediaPlayer
          key={src}
          src={src}
          filename={filename}
          mime={mime}
          kind={kind}
          poster={poster}
          onPrev={onPrev}
          onNext={onNext}
        />
      </div>

      {hasPlaylist && (
        <>
          {/* Open affordance — hidden while the drawer is open. */}
          {!playlistOpen && (
            <button
              type="button"
              onClick={() => setPlaylistOpen(true)}
              className="absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-1)]/90 px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] shadow-sm backdrop-blur-sm outline-none transition-colors hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              {kind === "video" ? <Video className="h-3.5 w-3.5" /> : <Music className="h-3.5 w-3.5" />}
              Playlist
              <span className="tabular-nums text-[var(--color-text-muted)]">{shownTracks.length}</span>
            </button>
          )}

          {/* Scrim — mobile bottom-sheet only; tap to dismiss. */}
          {playlistOpen && (
            <button
              type="button"
              aria-label="Close playlist"
              tabIndex={-1}
              onClick={() => setPlaylistOpen(false)}
              className="absolute inset-0 z-20 bg-black/40 lg:hidden"
            />
          )}

          {/* Drawer: bottom sheet on mobile, right-side drawer on desktop. The
              parent's overflow-hidden clips it off-screen when closed. */}
          <div
            role="dialog"
            aria-label="Playlist"
            className={cn(
              "absolute z-30 flex flex-col overflow-hidden bg-[var(--color-surface-1)] shadow-2xl transition-transform duration-300 ease-out",
              "inset-x-0 bottom-0 max-h-[70vh] rounded-t-2xl border-t border-[var(--color-border)]",
              "lg:inset-y-0 lg:bottom-auto lg:left-auto lg:right-0 lg:max-h-none lg:w-80 lg:rounded-none lg:rounded-l-2xl lg:border-l lg:border-t-0",
              playlistOpen
                ? "translate-y-0 lg:translate-x-0"
                : "translate-y-full lg:translate-y-0 lg:translate-x-full"
            )}
          >
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-3 text-xs font-semibold text-[var(--color-text-secondary)]">
              {kind === "video" ? <Video className="h-4 w-4" /> : <Music className="h-4 w-4" />}
              Playlist
              <span className="tabular-nums text-[var(--color-text-muted)]">{shownTracks.length}</span>
              <button
                type="button"
                onClick={() => setPlaylistOpen(false)}
                aria-label="Close playlist"
                className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-[var(--color-text-muted)] outline-none transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {canFilter && (
              <div className="flex gap-1 border-b border-[var(--color-border)] p-1.5">
                {(["all", "audio", "video"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    aria-pressed={filter === f}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1 text-[11px] font-medium capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
                      filter === f
                        ? "bg-[var(--color-accent)]/15 text-[var(--color-text)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}

            <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {shownTracks.map((track) => {
                const active = track.index === currentIndex;
                const info = getFileTypeInfo(track.file.original_name);
                const trackKind = kindOf(track);
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
                        ) : trackKind === "video" ? (
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
          </div>
        </>
      )}
    </div>
  );
}
