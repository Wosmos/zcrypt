"use client";

import { useState } from "react";
import { MiniPlayer } from "@/components/media/mini-player";
import { MediaPlayer } from "@/components/ui/media-player";
import { useNowPlaying } from "@/store/now-playing";
import type { FileMetadata } from "@/types";

function toneWav(seconds: number, hz: number): Blob {
  const rate = 8000;
  const n = rate * seconds;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++)
    v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * hz * i) / rate) * 8000, true);
  return new Blob([buf], { type: "audio/wav" });
}

async function sampleVideo(): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const ctx = canvas.getContext("2d");
  const rec = new MediaRecorder(canvas.captureStream(15), { mimeType: "video/webm" });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => parts.push(e.data);
  const done = new Promise<void>((r) => {
    rec.onstop = () => r();
  });
  rec.start();
  const start = performance.now();
  await new Promise<void>((r) => {
    const frame = () => {
      const t = (performance.now() - start) / 1000;
      if (ctx) {
        ctx.fillStyle = `hsl(${(t * 90) % 360} 70% 45%)`;
        ctx.fillRect(0, 0, 320, 180);
        ctx.fillStyle = "#fff";
        ctx.font = "28px sans-serif";
        ctx.fillText(`zcrypt ${t.toFixed(1)}s`, 90, 100);
      }
      if (t < 3) requestAnimationFrame(frame);
      else r();
    };
    frame();
  });
  rec.stop();
  await done;
  return new Blob(parts, { type: "video/webm" });
}

const file = (id: string, name: string) =>
  ({ id, original_name: name, folder_id: "dev" }) as unknown as FileMetadata;

export function MiniPlayerHarness() {
  const [full, setFull] = useState<{ src: string; kind: "audio" | "video" } | null>(null);
  const start = (queue: FileMetadata[], blobs: Blob[]) =>
    useNowPlaying.getState().start({
      queue,
      position: 0,
      src: URL.createObjectURL(blobs[0]),
      startAt: 0,
      autoplay: true,
      decrypt: async (f) => blobs[queue.findIndex((q) => q.id === f.id)] ?? blobs[0],
    });
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-3 p-8 pt-32">
      <button
        type="button"
        data-testid="audio"
        className="rounded-lg border p-3"
        onClick={() =>
          start(
            [file("a", "Morning walk.mp3"), file("b", "Second song.mp3")],
            [toneWav(20, 440), toneWav(20, 660)],
          )
        }
      >
        Play audio sample
      </button>
      <button
        type="button"
        data-testid="video"
        className="rounded-lg border p-3"
        onClick={async () => start([file("v", "Holiday clip.mp4")], [await sampleVideo()])}
      >
        Play video sample
      </button>
      <button
        type="button"
        data-testid="full-video"
        className="rounded-lg border p-3"
        onClick={async () =>
          setFull({ src: URL.createObjectURL(await sampleVideo()), kind: "video" })
        }
      >
        Open full video player
      </button>
      <button
        type="button"
        data-testid="full-audio"
        className="rounded-lg border p-3"
        onClick={() => setFull({ src: URL.createObjectURL(toneWav(20, 520)), kind: "audio" })}
      >
        Open full audio player
      </button>
      {full && (
        <MediaPlayer
          key={full.src}
          src={full.src}
          kind={full.kind}
          filename={full.kind === "video" ? "Full clip.mp4" : "Full song.mp3"}
          onMinimize={(at) => {
            useNowPlaying.getState().start({
              queue: [file("f", full.kind === "video" ? "Full clip.mp4" : "Full song.mp3")],
              position: 0,
              src: full.src,
              startAt: at.time,
              autoplay: at.playing,
              decrypt: async () => new Blob(),
            });
            setFull(null);
          }}
        />
      )}
      <MiniPlayer />
    </main>
  );
}
