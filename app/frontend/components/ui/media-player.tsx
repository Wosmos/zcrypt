"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { Play, Pause, Volume2, Gauge, Music, Monitor, Video, Download, SkipForward, RefreshCw } from "@/lib/icons";
import { mediaKindFor } from "@/lib/media-formats";
import { IconButton } from "@/components/ui/icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SPEEDS = [0.5, 1, 1.5, 2] as const;

// Default "album cover" gradients for audio (which has no real thumbnail). Each
// track gets a stable one derived from its filename, so a file always looks the
// same but the library shows variety.
const COVER_GRADIENTS = [
  "from-fuchsia-500 to-purple-700",
  "from-cyan-500 to-blue-700",
  "from-amber-500 to-rose-600",
  "from-emerald-500 to-teal-700",
  "from-pink-500 to-rose-700",
  "from-indigo-500 to-violet-700",
];

function coverGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COVER_GRADIENTS[h % COVER_GRADIENTS.length];
}

// Session-persisted playback settings. The player remounts on every track
// switch (keyed by src, so old blob URLs are revoked cleanly), which would
// otherwise reset volume/speed/loop to defaults each time — so we carry the
// user's last choices onto the next track within the session.
let lastVolume = 1;
let lastSpeed = 1;
let lastLoop = false;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Shared playback state + DOM wiring for an <audio> or <video> element.
 * Returns refs, derived state and the handlers a player skin needs.
 */
function useMediaController() {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(lastVolume);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState<number>(lastSpeed);
  const [ready, setReady] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  // True when the browser can't decode this source (unsupported codec/container
  // for a recognised-but-unplayable format) — the skin swaps to a Download panel.
  const [error, setError] = useState(false);
  const [loop, setLoop] = useState(lastLoop);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    // Restore session-persisted settings onto this (freshly mounted) element so
    // volume / speed / loop carry across track switches.
    el.volume = lastVolume;
    el.playbackRate = lastSpeed;
    el.loop = lastLoop;

    const onLoaded = () => {
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
      setReady(true);
      setError(false);
    };
    const onError = () => setError(true);
    const onTime = () => {
      if (!scrubbing) setCurrent(el.currentTime);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    const onVolume = () => {
      setVolume(el.volume);
      setMuted(el.muted);
    };
    const onProgress = () => {
      try {
        if (el.buffered.length > 0) {
          setBuffered(el.buffered.end(el.buffered.length - 1));
        }
      } catch {
        // buffered access can throw before metadata is ready
      }
    };
    const onRate = () => setSpeed(el.playbackRate);

    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("durationchange", onLoaded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    el.addEventListener("volumechange", onVolume);
    el.addEventListener("progress", onProgress);
    el.addEventListener("ratechange", onRate);
    el.addEventListener("error", onError);

    // Sync initial state in case metadata is already available.
    if (el.readyState >= 1) onLoaded();
    onVolume();

    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("durationchange", onLoaded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("volumechange", onVolume);
      el.removeEventListener("progress", onProgress);
      el.removeEventListener("ratechange", onRate);
      el.removeEventListener("error", onError);
    };
  }, [mediaRef, scrubbing]);

  const togglePlay = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }, [mediaRef]);

  const seekTo = useCallback(
    (time: number) => {
      const el = mediaRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(time, duration || el.duration || 0));
      el.currentTime = clamped;
      setCurrent(clamped);
    },
    [mediaRef, duration]
  );

  const skip = useCallback(
    (delta: number) => {
      const el = mediaRef.current;
      if (!el) return;
      seekTo(el.currentTime + delta);
    },
    [mediaRef, seekTo]
  );

  const changeVolume = useCallback(
    (value: number) => {
      const el = mediaRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(1, value));
      el.volume = clamped;
      el.muted = clamped === 0;
      setVolume(clamped);
      setMuted(clamped === 0);
      lastVolume = clamped;
    },
    [mediaRef]
  );

  const toggleMute = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    const next = !el.muted;
    el.muted = next;
    setMuted(next);
    if (!next && el.volume === 0) {
      el.volume = 0.5;
      setVolume(0.5);
    }
  }, [mediaRef]);

  const cycleSpeed = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    const idx = SPEEDS.indexOf(el.playbackRate as (typeof SPEEDS)[number]);
    const next = SPEEDS[(idx + 1) % SPEEDS.length] ?? 1;
    el.playbackRate = next;
    setSpeed(next);
    lastSpeed = next;
  }, [mediaRef]);

  const toggleLoop = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    const next = !el.loop;
    el.loop = next;
    setLoop(next);
    lastLoop = next;
  }, [mediaRef]);

  return {
    ref: mediaRef,
    playing,
    current,
    duration,
    buffered,
    volume,
    muted,
    speed,
    ready,
    error,
    loop,
    scrubbing,
    setScrubbing,
    setCurrent,
    togglePlay,
    seekTo,
    skip,
    changeVolume,
    toggleMute,
    cycleSpeed,
    toggleLoop,
  };
}

type Controller = ReturnType<typeof useMediaController>;

/* -------------------------------------------------------------------------- */
/* Seek bar                                                                   */
/* -------------------------------------------------------------------------- */

function SeekBar({
  current,
  duration,
  buffered,
  onScrubStart,
  onScrub,
  onScrubEnd,
  ariaLabel,
}: {
  current: number;
  duration: number;
  buffered: number;
  onScrubStart: () => void;
  onScrub: (time: number) => void;
  onScrubEnd: (time: number) => void;
  ariaLabel: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const bufPct = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;

  const timeFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || duration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (duration <= 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      draggingRef.current = true;
      onScrubStart();
      onScrub(timeFromPointer(e.clientX));
    },
    [duration, onScrub, onScrubStart, timeFromPointer]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      onScrub(timeFromPointer(e.clientX));
    },
    [onScrub, timeFromPointer]
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      onScrubEnd(timeFromPointer(e.clientX));
    },
    [onScrubEnd, timeFromPointer]
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (duration <= 0) return;
      let next: number | null = null;
      if (e.key === "ArrowRight") next = Math.min(duration, current + 5);
      else if (e.key === "ArrowLeft") next = Math.max(0, current - 5);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = duration;
      if (next !== null) {
        e.preventDefault();
        onScrubEnd(next);
      }
    },
    [current, duration, onScrubEnd]
  );

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.floor(duration) || 0}
      aria-valuenow={Math.floor(current) || 0}
      aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKey}
      className="group relative flex h-4 cursor-pointer touch-none items-center outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] rounded-full"
    >
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)] transition-[height] duration-150 group-hover:h-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-border-hover)]/70"
          style={{ width: `${bufPct}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-cyan-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500 opacity-0 shadow-sm ring-2 ring-[var(--color-surface)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Volume control                                                             */
/* -------------------------------------------------------------------------- */

function VolumeControl({
  volume,
  muted,
  onToggleMute,
  onChange,
}: {
  volume: number;
  muted: boolean;
  onToggleMute: () => void;
  onChange: (value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const effective = muted ? 0 : volume;
  const pct = Math.round(effective * 100);

  const valueFromPointer = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  return (
    <div className="group/vol flex items-center gap-1.5">
      <IconButton
        icon={Volume2}
        label={muted || volume === 0 ? "Unmute" : "Mute"}
        onClick={onToggleMute}
        iconClassName={cn(
          "h-4 w-4 transition-opacity",
          (muted || effective === 0) && "opacity-40"
        )}
      />
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          draggingRef.current = true;
          onChange(valueFromPointer(e.clientX));
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) onChange(valueFromPointer(e.clientX));
        }}
        onPointerUp={(e) => {
          draggingRef.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onChange(Math.min(1, effective + 0.05));
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(Math.max(0, effective - 0.05));
          }
        }}
        className="relative flex h-4 w-16 cursor-pointer touch-none items-center outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] rounded-full sm:w-20"
      >
        <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]">
          <div
            className="h-full rounded-full bg-[var(--color-text-secondary)]"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Speed control                                                              */
/* -------------------------------------------------------------------------- */

function SpeedControl({ speed, onCycle }: { speed: number; onCycle: () => void }) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onCycle}
            aria-label={`Playback speed ${speed}x`}
            className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium tabular-nums text-[var(--color-text-secondary)] outline-none transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface)] cursor-pointer"
          >
            <Gauge className="h-4 w-4" />
            {speed}x
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Playback speed</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* -------------------------------------------------------------------------- */
/* Time readout                                                               */
/* -------------------------------------------------------------------------- */

function TimeReadout({ current, duration }: { current: number; duration: number }) {
  return (
    <div className="flex select-none items-center gap-1 text-xs font-medium tabular-nums text-[var(--color-text-secondary)]">
      <span className="text-[var(--color-text)]">{formatTime(current)}</span>
      <span className="text-[var(--color-text-muted)]">/</span>
      <span>{formatTime(duration)}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Unplayable-format fallback                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Shown when the browser can't decode a recognised media file (e.g. avi, wmv,
 * mkv, or an MPEG-video container). Recognition still gave it the right icon
 * and routed it here; this offers a clean download instead of a broken player.
 */
function MediaErrorFallback({
  src,
  filename,
  kind,
}: {
  src: string;
  filename: string;
  kind: "audio" | "video";
}) {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-surface-1)] text-[var(--color-text-muted)]">
        {kind === "video" ? <Video className="h-7 w-7" /> : <Music className="h-7 w-7" />}
      </div>
      <p className="max-w-full truncate text-sm font-medium text-[var(--color-text)]">{filename}</p>
      <p className="max-w-xs text-xs leading-relaxed text-[var(--color-text-muted)]">
        This format can&rsquo;t be played in the browser. Download it to open in a native player.
      </p>
      <a
        href={src}
        download={filename}
        className="mt-1 inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
      >
        <Download className="h-4 w-4" />
        Download
      </a>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Audio player                                                               */
/* -------------------------------------------------------------------------- */

function AudioPlayer({
  src,
  filename,
  controller,
  onPrev,
  onNext,
}: {
  src: string;
  filename: string;
  controller: Controller;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const {
    playing,
    current,
    duration,
    buffered,
    volume,
    muted,
    speed,
    error,
    loop,
    setScrubbing,
    setCurrent,
    togglePlay,
    seekTo,
    changeVolume,
    toggleMute,
    cycleSpeed,
    toggleLoop,
  } = controller;

  return (
    <div className="flex flex-col items-stretch gap-6 py-2">
      {error ? (
        <MediaErrorFallback src={src} filename={filename} kind="audio" />
      ) : (
        <>
      {/* Album cover — a default gradient (audio has no real thumbnail), with
          an equalizer that dances while playing. Deliberately unlike the
          video's black cinematic frame. */}
      <div className="flex flex-col items-center gap-5 py-4">
        <div
          aria-hidden
          className={cn(
            // Cap by viewport height too, so a short mobile player area doesn't
            // clip the square cover.
            "relative flex aspect-square w-full max-w-[min(248px,42vh)] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br shadow-[0_10px_30px_rgba(0,0,0,0.25)]",
            coverGradient(filename)
          )}
        >
          {/* depth + gloss */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/10" />
          <Music className="h-20 w-20 text-white/90 drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]" />
          {playing && !reduce && (
            <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-end gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 rounded-full bg-white/90"
                  style={{ height: 8 }}
                  animate={{ height: [8, 22, 8] }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.13 }}
                />
              ))}
            </div>
          )}
        </div>
        <p className="max-w-full truncate px-4 text-center text-sm font-medium text-[var(--color-text)]">
          {filename}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <SeekBar
          current={current}
          duration={duration}
          buffered={buffered}
          ariaLabel="Seek audio"
          onScrubStart={() => setScrubbing(true)}
          onScrub={(t) => setCurrent(t)}
          onScrubEnd={(t) => {
            seekTo(t);
            setScrubbing(false);
          }}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex w-16 justify-start sm:w-20">
            <TimeReadout current={current} duration={duration} />
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5">
            <IconButton
              icon={RefreshCw}
              label={loop ? "Loop on" : "Loop"}
              aria-pressed={loop}
              onClick={toggleLoop}
              iconClassName={cn("h-4 w-4", loop && "text-[var(--color-accent)]")}
            />
            <IconButton
              icon={SkipForward}
              label="Previous track"
              onClick={onPrev}
              disabled={!onPrev}
              iconClassName="h-4 w-4 -scale-x-100"
            />
            <IconButton
              icon={playing ? Pause : Play}
              label={playing ? "Pause" : "Play"}
              variant="primary"
              onClick={togglePlay}
              className="h-11 w-11 rounded-full"
              iconClassName="h-5 w-5"
            />
            <IconButton
              icon={SkipForward}
              label="Next track"
              onClick={onNext}
              disabled={!onNext}
              iconClassName="h-4 w-4"
            />
          </div>

          <div className="flex w-16 items-center justify-end gap-1 sm:w-20">
            <SpeedControl speed={speed} onCycle={cycleSpeed} />
          </div>
        </div>

        <div className="flex justify-center pt-1">
          <VolumeControl
            volume={volume}
            muted={muted}
            onToggleMute={toggleMute}
            onChange={changeVolume}
          />
        </div>
      </div>
        </>
      )}

      <audio
        ref={controller.ref as React.RefObject<HTMLAudioElement>}
        src={src}
        preload="metadata"
        className="hidden"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Video player                                                               */
/* -------------------------------------------------------------------------- */

function VideoPlayer({
  src,
  filename,
  poster,
  controller,
}: {
  src: string;
  filename: string;
  poster?: string;
  controller: Controller;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(true);
  // Intrinsic aspect ratio (w/h) read from the decoded video, so the frame hugs
  // the real shape — portrait (9:16), square (1:1), landscape (16:9) — instead
  // of floating pillarboxed in a fixed landscape box. Null until metadata loads.
  const [aspect, setAspect] = useState<number | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    playing,
    current,
    duration,
    buffered,
    volume,
    muted,
    speed,
    error,
    setScrubbing,
    setCurrent,
    togglePlay,
    seekTo,
    changeVolume,
    toggleMute,
    cycleSpeed,
  } = controller;

  const revealControls = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playing) setShowControls(false);
    }, 2600);
  }, [playing]);

  useEffect(() => {
    if (!playing) setShowControls(true);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [playing]);

  // Read the true aspect ratio once metadata is available (and on `resize`,
  // which fires if the dimensions change for a source that reports late).
  useEffect(() => {
    const el = controller.ref.current as HTMLVideoElement | null;
    if (!el) return;
    const read = () => {
      if (el.videoWidth > 0 && el.videoHeight > 0) {
        setAspect(el.videoWidth / el.videoHeight);
      }
    };
    el.addEventListener("loadedmetadata", read);
    el.addEventListener("resize", read);
    if (el.readyState >= 1) read();
    return () => {
      el.removeEventListener("loadedmetadata", read);
      el.removeEventListener("resize", read);
    };
  }, [controller.ref, src]);

  const toggleFullscreen = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void node.requestFullscreen?.().catch(() => {});
    }
  }, []);

  // Portrait / square videos are pinned by HEIGHT so they don't stretch to the
  // full landscape width; wider-than-tall videos fill the available width and
  // cap their height. The container carries the real aspect-ratio so the frame
  // matches the content and object-contain never has to add black bands.
  const isPortrait = aspect !== null && aspect <= 1;

  // The <video> mounts on first render and fires `error` if the codec/container
  // is unsupported; we then swap to a neutral download panel (the black
  // cinematic frame would clash with themed fallback text).
  if (error) {
    return (
      <div className="mx-auto w-full overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]">
        <MediaErrorFallback src={src} filename={filename} kind="video" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onPointerMove={revealControls}
      onPointerLeave={() => {
        if (playing) setShowControls(false);
      }}
      style={{ aspectRatio: String(aspect ?? 16 / 9) }}
      className={cn(
        "group relative mx-auto flex items-center justify-center overflow-hidden rounded-xl bg-black",
        isPortrait ? "h-[70vh] w-auto max-w-full" : "max-h-[70vh] w-full",
        !showControls && playing ? "cursor-none" : "cursor-default"
      )}
    >
      <video
        ref={controller.ref as React.RefObject<HTMLVideoElement>}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        onClick={togglePlay}
        className="h-full w-full bg-black object-contain"
      >
        Your browser does not support video playback.
      </video>

      {/* Center play affordance when paused */}
      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play video"
          className="absolute inset-0 flex items-center justify-center bg-black/20 outline-none transition-colors hover:bg-black/30 focus-visible:bg-black/30"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-[#1a1f36] shadow-lg backdrop-blur-sm">
            <Play className="h-7 w-7 translate-x-0.5" />
          </span>
        </button>
      )}

      {/* Control bar */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-8 transition-opacity duration-300",
          showControls || !playing ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <div className="[--color-surface:#000]">
          <SeekBar
            current={current}
            duration={duration}
            buffered={buffered}
            ariaLabel="Seek video"
            onScrubStart={() => setScrubbing(true)}
            onScrub={(t) => setCurrent(t)}
            onScrubEnd={(t) => {
              seekTo(t);
              setScrubbing(false);
            }}
          />
        </div>

        <div className="flex items-center gap-1 text-white">
          <IconButton
            icon={playing ? Pause : Play}
            label={playing ? "Pause" : "Play"}
            onClick={togglePlay}
            className="text-white hover:bg-white/15 hover:text-white"
          />

          <div className="hidden sm:block [--color-surface:#000]">
            <div className="text-white [&_button]:text-white [&_button:hover]:bg-white/15 [&_button:hover]:text-white">
              <VolumeControl
                volume={volume}
                muted={muted}
                onToggleMute={toggleMute}
                onChange={changeVolume}
              />
            </div>
          </div>

          <div className="ml-1 text-white">
            <TimeReadoutLight current={current} duration={duration} />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <div className="text-white [&_button]:text-white [&_button:hover]:bg-white/15 [&_button:hover]:text-white">
              <SpeedControl speed={speed} onCycle={cycleSpeed} />
            </div>
            <IconButton
              icon={Monitor}
              label="Fullscreen"
              onClick={toggleFullscreen}
              className="text-white hover:bg-white/15 hover:text-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeReadoutLight({ current, duration }: { current: number; duration: number }) {
  return (
    <div className="flex select-none items-center gap-1 text-xs font-medium tabular-nums text-white/90">
      <span>{formatTime(current)}</span>
      <span className="text-white/50">/</span>
      <span className="text-white/70">{formatTime(duration)}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Public component                                                           */
/* -------------------------------------------------------------------------- */

export interface MediaPlayerProps {
  /** Object URL (or any playable src) for the decrypted media blob. */
  src: string;
  /** Original filename — used as the audio title. */
  filename: string;
  /** MIME type of the media (used to pick the audio vs video skin). */
  mime?: string;
  /** Force a specific kind; otherwise inferred from `mime`/`filename`. */
  kind?: "audio" | "video";
  /** Optional still frame (the cached grid thumbnail) shown before video play. */
  poster?: string;
  /** Playlist navigation — go to the previous / next track (undefined at ends). */
  onPrev?: () => void;
  onNext?: () => void;
}

function resolveKind(props: MediaPlayerProps): "audio" | "video" {
  if (props.kind) return props.kind;
  if (props.mime?.startsWith("video/")) return "video";
  if (props.mime?.startsWith("audio/")) return "audio";
  return mediaKindFor(props.filename) ?? "audio";
}

/**
 * Polished player for decrypted audio/video previews. The media element is
 * created internally and wired to a shared controller; consumers only pass an
 * object URL + filename. Keyboard accessible and reduced-motion safe.
 */
export function MediaPlayer(props: MediaPlayerProps) {
  const { src, filename, poster, onPrev, onNext } = props;
  const kind = useMemo(
    () => resolveKind(props),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.kind, props.mime, props.filename]
  );
  const controller = useMediaController();

  // Space / arrow shortcuts scoped to the player wrapper.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      // Let interactive controls (sliders, buttons) handle their own keys.
      if (target.getAttribute("role") === "slider") return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        controller.togglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        controller.skip(5);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        controller.skip(-5);
      } else if (e.key === "m") {
        e.preventDefault();
        controller.toggleMute();
      }
    },
    [controller]
  );

  return (
    <div onKeyDown={onKeyDown} tabIndex={-1} className="w-full outline-none">
      {kind === "video" ? (
        <VideoPlayer src={src} filename={filename} poster={poster} controller={controller} />
      ) : (
        <AudioPlayer src={src} filename={filename} controller={controller} onPrev={onPrev} onNext={onNext} />
      )}
    </div>
  );
}
