"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Music, Pause, PictureInPicture, Play, SkipForward, X } from "@/lib/icons";
import { IconButton } from "@/components/ui/icon-button";
import {
  coverGradient,
  SeekBar,
  useMediaController,
  useVideoPictureInPicture,
  type Controller,
} from "@/components/ui/media-player";
import { mediaKindFor } from "@/lib/media-formats";
import {
  canDocumentPictureInPicture,
  openDocumentPictureInPicture,
} from "@/lib/picture-in-picture";
import { currentTrack, useNowPlaying } from "@/store/now-playing";
import { useTransferDockStore } from "@/store/transfer-dock";
import { cn, formatDuration } from "@/lib/utils";

function resumePlayback(el: HTMLMediaElement, startAt: number, autoplay: boolean) {
  if (startAt > 0) el.currentTime = startAt;
  if (autoplay) void el.play().catch(() => {});
}

const MEDIA_ACTIONS: MediaSessionAction[] = [
  "play",
  "pause",
  "seekbackward",
  "seekforward",
  "seekto",
  "previoustrack",
  "nexttrack",
];

/**
 * The app-wide mini player: keeps a minimized track playing while you browse.
 * Mounted once in the app shell; renders nothing until a viewer hands it a
 * track (see store/now-playing.ts, which owns and revokes the plaintext URL).
 */
export function MiniPlayer() {
  const src = useNowPlaying((s) => s.src);
  const queue = useNowPlaying((s) => s.queue);
  const position = useNowPlaying((s) => s.position);
  const track = useNowPlaying(currentTrack);
  const reportHeight = useNowPlaying((s) => s.reportHeight);
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!src || !el) {
      reportHeight(0);
      return;
    }
    const measure = () => reportHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      reportHeight(0);
    };
  }, [src, reportHeight]);

  if (!src || !track) return null;
  return (
    <MiniPlayerFrame ref={rootRef}>
      {/* Keyed by src: each track gets a fresh element and controller, the
          same remount-per-track rule the full player follows. */}
      <MiniPlayerBody
        key={src}
        src={src}
        name={track.original_name}
        kind={mediaKindFor(track.original_name) ?? "audio"}
        hasPrev={position > 0}
        hasNext={position < queue.length - 1}
      />
    </MiniPlayerFrame>
  );
}

function MiniPlayerFrame({
  ref,
  children,
}: {
  ref: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const tm = useTranslations("ui.media");
  const dockVisible = useTransferDockStore((s) => s.visible);
  const dockHeight = useTransferDockStore((s) => s.height);
  const lift = dockVisible ? dockHeight + 12 : 0;
  return (
    <div
      ref={ref}
      role="region"
      aria-label={tm("nowPlaying")}
      style={{ "--mini-lift": `${lift}px` } as React.CSSProperties}
      className="fixed inset-x-2 bottom-[calc(5rem+var(--safe-bottom)+var(--mini-lift))] z-40 overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl md:inset-x-auto md:end-4 md:bottom-[calc(1rem+var(--mini-lift))] md:w-[340px]"
    >
      {children}
    </div>
  );
}

function MiniPlayerBody({
  src,
  name,
  kind,
  hasPrev,
  hasNext,
}: {
  src: string;
  name: string;
  kind: "audio" | "video";
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const tm = useTranslations("ui.media");
  const controller = useMediaController();
  // oxlint-disable-next-line react/refs
  const pip = useVideoPictureInPicture(controller.ref);
  const loading = useNowPlaying((s) => s.loading);
  const failed = useNowPlaying((s) => s.error);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  // Client-only: the mini player never renders on the server (no track then).
  const docPip = kind === "audio" && canDocumentPictureInPicture();
  const { togglePlay } = controller;

  const position = useNowPlaying((s) => s.position);
  const playAt = useNowPlaying((s) => s.playAt);
  const close = useNowPlaying((s) => s.close);
  const onPrev = hasPrev ? () => void playAt(position - 1) : undefined;
  const onNext = hasNext ? () => void playAt(position + 1) : undefined;

  // Resume where the viewer left off, once, when this track's metadata loads.
  useEffect(() => {
    const el = controller.ref.current;
    if (!el) return;
    const { startAt, autoplay } = useNowPlaying.getState();
    const resume = () => resumePlayback(el, startAt, autoplay);
    if (el.readyState >= 1) resume();
    else el.addEventListener("loadedmetadata", resume, { once: true });
    return () => el.removeEventListener("loadedmetadata", resume);
  }, [controller.ref]);

  // A finished track moves on through the folder, like the full player's list.
  useEffect(() => {
    const el = controller.ref.current;
    if (!el || !hasNext) return;
    const next = () => {
      if (!el.loop) void playAt(useNowPlaying.getState().position + 1);
    };
    el.addEventListener("ended", next);
    return () => el.removeEventListener("ended", next);
  }, [controller.ref, hasNext, playAt]);

  useEffect(() => {
    if (!pipWindow) return;
    const gone = () => setPipWindow(null);
    pipWindow.addEventListener("pagehide", gone);
    return () => {
      pipWindow.removeEventListener("pagehide", gone);
      pipWindow.close();
    };
  }, [pipWindow]);

  useMediaSession(name, controller, onPrev, onNext, kind === "video" ? pip.toggle : undefined);

  const openAudioPip = useCallback(async () => {
    if (pipWindow) {
      pipWindow.close();
      return;
    }
    setPipWindow(await openDocumentPictureInPicture({ width: 360, height: 132 }));
  }, [pipWindow]);

  const controls = (
    <MiniControls
      name={name}
      kind={kind}
      controller={controller}
      loading={loading}
      failed={failed}
      onPrev={onPrev}
      onNext={onNext}
    />
  );

  return (
    <div className={cn("flex", kind === "video" ? "flex-row md:flex-col" : "flex-row")}>
      {kind === "video" ? (
        <video
          // oxlint-disable-next-line react/refs
          ref={controller.ref as React.RefObject<HTMLVideoElement>}
          src={src}
          playsInline
          preload="metadata"
          onClick={togglePlay}
          className="aspect-video w-32 shrink-0 cursor-pointer bg-black object-contain md:w-full"
        />
      ) : (
        <audio
          // oxlint-disable-next-line react/refs
          ref={controller.ref as React.RefObject<HTMLAudioElement>}
          src={src}
          preload="metadata"
          className="hidden"
        />
      )}
      <div className="flex min-w-0 flex-1 items-start gap-1 p-2 ps-3">
        <div className="min-w-0 flex-1">
          {pipWindow ? (
            <p className="truncate py-2 text-xs text-[var(--color-text-muted)]">
              {tm("playingInWindow")}
            </p>
          ) : (
            controls
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center">
          <IconButton icon={X} label={tm("closePlayer")} onClick={close} iconClassName="h-4 w-4" />
          {(kind === "video" ? pip.supported : docPip) && (
            <IconButton
              icon={PictureInPicture}
              label={
                (kind === "video" ? pip.active : !!pipWindow)
                  ? tm("exitPictureInPicture")
                  : tm("pictureInPicture")
              }
              aria-pressed={kind === "video" ? pip.active : !!pipWindow}
              onClick={kind === "video" ? pip.toggle : () => void openAudioPip()}
              iconClassName="h-4 w-4"
            />
          )}
        </div>
      </div>
      {pipWindow &&
        createPortal(
          <div className="flex h-full items-center bg-[var(--color-surface)] p-3 text-[var(--color-text)]">
            {controls}
          </div>,
          pipWindow.document.body,
        )}
    </div>
  );
}

function MiniControls({
  name,
  kind,
  controller,
  loading,
  failed,
  onPrev,
  onNext,
}: {
  name: string;
  kind: "audio" | "video";
  controller: Controller;
  loading: boolean;
  failed: boolean;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const tm = useTranslations("ui.media");
  const { playing, current, duration, buffered, togglePlay, seekTo, setScrubbing, setCurrent } =
    controller;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-2">
        {kind === "audio" && (
          <span
            aria-hidden="true"
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white",
              coverGradient(name),
            )}
          >
            <Music className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--color-text)]" title={name}>
            {name}
          </p>
          <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
            {failed
              ? tm("trackFailed")
              : `${formatDuration(current)} / ${formatDuration(duration)}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <IconButton
          icon={SkipForward}
          label={tm("previousTrack")}
          onClick={onPrev}
          disabled={!onPrev || loading}
          iconClassName="h-4 w-4 -scale-x-100"
        />
        <IconButton
          icon={playing ? Pause : Play}
          label={playing ? tm("pause") : tm("play")}
          variant="primary"
          onClick={togglePlay}
          disabled={loading}
          className="h-9 w-9 rounded-full"
          iconClassName="h-4 w-4"
        />
        <IconButton
          icon={SkipForward}
          label={tm("nextTrack")}
          onClick={onNext}
          disabled={!onNext || loading}
          iconClassName="h-4 w-4"
        />
        <div className="ms-1 min-w-0 flex-1">
          <SeekBar
            current={current}
            duration={duration}
            buffered={buffered}
            ariaLabel={kind === "video" ? tm("seekVideo") : tm("seekAudio")}
            onScrubStart={() => setScrubbing(true)}
            onScrub={(t) => setCurrent(t)}
            onScrubEnd={(t) => {
              seekTo(t);
              setScrubbing(false);
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Hooks the track into the OS media controls: the macOS Now Playing panel,
 * Windows and Android media controls, keyboard media keys, and Chromium's
 * automatic picture-in-picture when the tab is hidden. Everything is cleared
 * when the track changes or the player closes.
 */
function useMediaSession(
  title: string,
  controller: Controller,
  onPrev?: () => void,
  onNext?: () => void,
  enterPip?: () => void,
) {
  const latest = useRef({ controller, onPrev, onNext, enterPip });
  useLayoutEffect(() => {
    latest.current = { controller, onPrev, onNext, enterPip };
  });
  const hasPrev = !!onPrev;
  const hasNext = !!onNext;
  const hasPip = !!enterPip;

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handle = (
      action: MediaSessionAction | "enterpictureinpicture",
      fn: (() => void) | null,
    ) => {
      try {
        session.setActionHandler(action as MediaSessionAction, fn);
      } catch {
        // The browser doesn't know this action.
      }
    };
    const el = () => latest.current.controller.ref.current;
    if (typeof MediaMetadata !== "undefined") session.metadata = new MediaMetadata({ title });
    handle("play", () => void el()?.play());
    handle("pause", () => el()?.pause());
    handle("seekbackward", () => latest.current.controller.skip(-10));
    handle("seekforward", () => latest.current.controller.skip(10));
    try {
      session.setActionHandler("seekto", (d) => {
        if (d.seekTime != null) latest.current.controller.seekTo(d.seekTime);
      });
    } catch {
      // seekto unsupported
    }
    handle("previoustrack", hasPrev ? () => latest.current.onPrev?.() : null);
    handle("nexttrack", hasNext ? () => latest.current.onNext?.() : null);
    if (hasPip) handle("enterpictureinpicture", () => latest.current.enterPip?.());
    return () => {
      for (const action of MEDIA_ACTIONS) handle(action, null);
      if (hasPip) handle("enterpictureinpicture", null);
      session.metadata = null;
    };
  }, [title, hasPrev, hasNext, hasPip]);
}
