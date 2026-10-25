import { describe, expect, it } from "vitest";
import {
  batchSentence,
  bytePair,
  describeDownload,
  describeUpload,
  errorLabel,
  remainingFromElapsed,
  timeLeftLabel,
  translateLabel,
  type BatchCounts,
  type DownloadProgressInput,
  type UploadProgressInput,
} from "@/lib/transfer-progress";

const MB = 1024 * 1024;
const ctx = { online: true, folderName: "Family" };
const up = (p: Partial<UploadProgressInput>): UploadProgressInput => ({
  status: "uploading",
  progress: 0,
  ...p,
});
const down = (p: Partial<DownloadProgressInput>): DownloadProgressInput => ({
  status: "downloading",
  progress: 0,
  ...p,
});

describe("bytePair", () => {
  it("shows both sides in the unit of the total", () => {
    expect(bytePair(2.8 * MB, 4.8 * MB)).toEqual({ done: "2.8", total: "4.8 MB" });
    expect(bytePair(512, 2 * 1024 * MB)).toEqual({ done: "0", total: "2 GB" });
  });
  it("caps done at total and copes with tiny and empty totals", () => {
    expect(bytePair(900, 800)).toEqual({ done: "800", total: "800 B" });
    expect(bytePair(0, 0)).toEqual({ done: "0", total: "0 B" });
  });
});

describe("timeLeftLabel", () => {
  it("returns nothing for unknown, zero, negative or infinite time", () => {
    expect(timeLeftLabel(undefined)).toBeUndefined();
    expect(timeLeftLabel(0)).toBeUndefined();
    expect(timeLeftLabel(-3)).toBeUndefined();
    expect(timeLeftLabel(Infinity)).toBeUndefined();
  });
  it("rounds into plain words", () => {
    expect(timeLeftLabel(7)).toEqual({ key: "time.fewSeconds" });
    expect(timeLeftLabel(11)).toEqual({ key: "time.seconds", values: { count: 10 } });
    expect(timeLeftLabel(38)).toEqual({ key: "time.seconds", values: { count: 40 } });
    expect(timeLeftLabel(59)).toEqual({ key: "time.minutes", values: { count: 1 } });
    expect(timeLeftLabel(70)).toEqual({ key: "time.minutes", values: { count: 1 } });
    expect(timeLeftLabel(59 * 60)).toEqual({ key: "time.minutes", values: { count: 59 } });
    expect(timeLeftLabel(2 * 3600 + 9 * 60)).toEqual({
      key: "time.hoursMinutes",
      values: { hours: 2, minutes: 10 },
    });
    expect(timeLeftLabel(3600 * 2 + 60)).toEqual({ key: "time.hours", values: { hours: 2 } });
    expect(timeLeftLabel(3600 + 59 * 60)).toEqual({ key: "time.hours", values: { hours: 2 } });
  });
});

describe("remainingFromElapsed", () => {
  it("needs a real percent and some elapsed time", () => {
    expect(remainingFromElapsed(0, 1, 10_000)).toBeUndefined();
    expect(remainingFromElapsed(0, 100, 10_000)).toBeUndefined();
    expect(remainingFromElapsed(0, 50, 2_000)).toBeUndefined();
  });
  it("extrapolates from elapsed time", () => {
    expect(remainingFromElapsed(0, 50, 10_000)).toBe(10);
  });
});

describe("errorLabel", () => {
  const cases: [string, string][] = [
    ["Too large to download in this browser", "errors.tooBigDownload"],
    ["Too large to ZIP in this browser", "errors.tooBigZip"],
    ["Choose where to save the ZIP", "errors.chooseZip"],
    ["No storage platform connected. Go to Settings to connect one.", "errors.noPlatform"],
    ["storage not available", "errors.noPlatform"],
    ["Unlock your vault to continue", "errors.vaultLocked"],
    ["Open the protected folder to unlock it", "errors.unlockFolder"],
    ["Wrong folder password", "errors.unlockFolder"],
    ["Decryption failed for a.jpg, wrong passphrase?", "errors.wrongKey"],
    ["Integrity check failed for a.jpg", "errors.damaged"],
    ["HTTP 413", "errors.tooBigUpload"],
    ["quota exceeded", "errors.storageFull"],
    ["Upload failed", "errors.sendFailed"],
  ];
  for (const [raw, key] of cases) {
    it(`maps "${raw}"`, () => expect(errorLabel("upload", raw, 0).key).toBe(key));
  }
  it("maps a localized no-platform text passed in", () => {
    expect(errorLabel("upload", "Keine Plattform", 0, "Keine Plattform").key).toBe("errors.noPlatform");
    expect(errorLabel("upload", "Something", 0, "Keine Plattform").key).toBe("errors.sendFailed");
  });
  it("names where the connection dropped, per direction", () => {
    expect(errorLabel("upload", "Can't reach zcrypt's servers (network/DNS)", 57.6)).toEqual({
      key: "errors.dropped",
      values: { percent: 58 },
    });
    expect(errorLabel("download", "Failed to fetch", 12)).toEqual({
      key: "errors.droppedDownload",
      values: { percent: 12 },
    });
  });
  it("falls back to a generic sentence, per direction", () => {
    expect(errorLabel("upload", undefined, 0).key).toBe("errors.sendFailed");
    expect(errorLabel("download", "Download failed", 0).key).toBe("errors.downloadFailed");
    expect(errorLabel("download", "ZIP download failed", 0).key).toBe("errors.downloadFailed");
  });
});

describe("describeUpload", () => {
  it("getting ready: hashing, deriving, session start and slot waits", () => {
    expect(describeUpload(up({ status: "encrypting", stage: "Hashing file…" }), ctx)).toMatchObject({
      phase: "ready",
      bar: 1,
      label: { key: "progress.ready" },
    });
    expect(describeUpload(up({ status: "encrypting", stage: "Hashing file… 50%" }), ctx).bar).toBe(3.5);
    expect(
      describeUpload(up({ status: "encrypting", stage: "hashing", bytesProcessed: 5, totalBytes: 10 }), ctx)
        .bar,
    ).toBe(3.5);
    expect(describeUpload(up({ status: "encrypting", stage: "hashing" }), ctx).bar).toBe(1);
    expect(describeUpload(up({ status: "encrypting", stage: "Deriving encryption key..." }), ctx).bar).toBe(6);
    expect(describeUpload(up({ status: "encrypting", stage: "deriving_key" }), ctx).bar).toBe(6);
    expect(
      describeUpload(up({ status: "encrypting", stage: "Starting upload session..." }), ctx).phase,
    ).toBe("ready");
    const slot = describeUpload(up({ status: "queued", stage: "Waiting for slot (3)..." }), ctx);
    expect(slot).toMatchObject({ phase: "ready", bar: 7 });
    expect(describeUpload(up({ status: "queued", stage: "Retrying..." }), ctx).phase).toBe("ready");
    expect(describeUpload(up({ status: "encrypting", stage: "", progress: 2 }), ctx).bar).toBe(4);
    expect(describeUpload(up({ status: "encrypting", progress: -1 }), ctx).bar).toBe(0);
  });

  it("securing while the first chunk is encrypted", () => {
    expect(describeUpload(up({ stage: "Uploading chunk 1/3" }), ctx)).toMatchObject({
      phase: "securing",
      bar: 12,
      label: { key: "progress.securing" },
    });
    expect(describeUpload(up({ status: "encrypting", stage: "Uploading..." }), ctx).phase).toBe("securing");
    expect(describeUpload(up({ status: "encrypting", stage: "processing" }), ctx).phase).toBe("securing");
  });

  it("sending reports bytes, never chunk numbers", () => {
    const v = describeUpload(
      up({ stage: "Uploading chunk 2/3", bytesProcessed: 2.8 * MB, totalBytes: 4.8 * MB }),
      ctx,
    );
    expect(v.phase).toBe("sending");
    expect(v.bar).toBeCloseTo(20 + 77 * (2.8 / 4.8));
    expect(v.label).toEqual({ key: "progress.sendingBytes", values: { done: "2.8", total: "4.8 MB" } });
  });

  it("sending falls back to time left, then to the bare word, when bytes are unknown", () => {
    const eta = describeUpload(up({ stage: "uploading", progress: 49, etaSeconds: 40 }), ctx);
    expect(eta.phase).toBe("sending");
    expect(eta.bar).toBeCloseTo(20 + 77 * 0.5);
    expect(eta.label).toEqual({
      key: "progress.sendingEta",
      values: { time: { key: "time.seconds", values: { count: 40 } } },
    });
    expect(describeUpload(up({ stage: "uploading", progress: 99 }), ctx)).toMatchObject({
      bar: 97,
      label: { key: "progress.sending" },
    });
    expect(describeUpload(up({ stage: "Resuming…", progress: 5 }), ctx).phase).toBe("securing");
  });

  it("checking, then saved to the folder", () => {
    expect(describeUpload(up({ stage: "Finalizing..." }), ctx)).toMatchObject({
      phase: "checking",
      bar: 98,
      label: { key: "progress.checking" },
    });
    expect(describeUpload(up({ stage: "finalizing" }), ctx).phase).toBe("checking");
    expect(describeUpload(up({ status: "done", stage: "Done", progress: 100 }), ctx)).toEqual({
      phase: "saved",
      bar: 100,
      label: { key: "progress.savedTo", values: { folder: "Family" } },
    });
  });

  it("paused, queued and offline", () => {
    expect(describeUpload(up({ status: "paused", stage: "Paused" }), ctx).label.key).toBe("progress.paused");
    expect(describeUpload(up({ status: "queued", stage: "Queued" }), ctx).label.key).toBe("progress.queued");
    expect(describeUpload(up({ status: "queued" }), ctx).label.key).toBe("progress.queued");
    expect(describeUpload(up({ stage: "Uploading chunk 1/2" }), { ...ctx, online: false }).label.key).toBe(
      "progress.offline",
    );
  });

  it("failed rows freeze where they stopped and say why", () => {
    const v = describeUpload(
      up({ status: "failed", error: "Failed to fetch", bytesProcessed: 50, totalBytes: 100 }),
      ctx,
    );
    expect(v.phase).toBe("failed");
    expect(v.label).toEqual({ key: "errors.dropped", values: { percent: 59 } });
    expect(
      describeUpload(up({ status: "failed", error: "Keine" }), { ...ctx, noPlatformText: "Keine" }).label.key,
    ).toBe("errors.noPlatform");
  });

  it("the bar never goes backwards and never sits at 100 while work remains", () => {
    const first = describeUpload(up({ stage: "Uploading chunk 1/2", bytesProcessed: 90, totalBytes: 100 }), ctx);
    const next = describeUpload(up({ status: "encrypting", stage: "Hashing file…" }), {
      ...ctx,
      prevBar: first.bar,
    });
    expect(next.bar).toBe(first.bar);
    expect(describeUpload(up({ stage: "Finalizing..." }), { ...ctx, prevBar: 100 }).bar).toBe(99);
  });

});

describe("describeDownload", () => {
  it("fetching shows bytes from the real size", () => {
    const v = describeDownload(down({ progress: 47, fileSize: 3 * MB }), ctx);
    expect(v.phase).toBe("fetching");
    expect(v.bar).toBe(47);
    expect(v.label).toEqual({ key: "progress.fetchingBytes", values: { done: "1.5", total: "3 MB" } });
  });
  it("fetching falls back to time left, then to the bare word", () => {
    expect(describeDownload(down({ progress: 1, etaSeconds: 70 }), ctx).label).toEqual({
      key: "progress.fetchingEta",
      values: { time: { key: "time.minutes", values: { count: 1 } } },
    });
    expect(describeDownload(down({ progress: 1 }), ctx).label.key).toBe("progress.fetching");
    expect(describeDownload(down({ progress: -5 }), ctx).bar).toBe(0);
    expect(describeDownload(down({ progress: 92 }), ctx).bar).toBe(88);
  });
  it("unlocking, saving, downloaded", () => {
    expect(describeDownload(down({ progress: 93 }), ctx)).toMatchObject({ phase: "unlocking", bar: 92 });
    expect(describeDownload(down({ progress: 97 }), ctx)).toMatchObject({ phase: "saving", bar: 97 });
    expect(describeDownload(down({ status: "done", progress: 100 }), ctx)).toMatchObject({
      phase: "downloaded",
      bar: 100,
      label: { key: "progress.downloaded" },
    });
  });
  it("queued, choose a place, paused, stopped, offline", () => {
    expect(describeDownload(down({ status: "queued", stage: "Queued" }), ctx).phase).toBe("queued");
    expect(describeDownload(down({ status: "queued" }), ctx).phase).toBe("queued");
    expect(describeDownload(down({ status: "queued", stage: "Choose where to save…" }), ctx).label.key).toBe(
      "progress.choose",
    );
    expect(describeDownload(down({ status: "paused" }), ctx).phase).toBe("paused");
    expect(describeDownload(down({ status: "cancelled" }), ctx).label.key).toBe("progress.stopped");
    expect(describeDownload(down({}), { ...ctx, online: false }).phase).toBe("offline");
  });
  it("failed downloads map their error and keep the bar", () => {
    const v = describeDownload(down({ status: "failed", progress: 40, error: "Too large to download in this browser" }), {
      ...ctx,
      prevBar: 44,
    });
    expect(v).toMatchObject({ phase: "failed", bar: 44, label: { key: "errors.tooBigDownload" } });
  });
});

describe("batchSentence", () => {
  const base: BatchCounts = {
    direction: "upload",
    done: 0,
    failed: 0,
    active: 0,
    waiting: 0,
    paused: 0,
    photos: true,
    folderName: "Family",
    online: true,
  };
  it("while sending", () => {
    expect(batchSentence({ ...base, active: 2, waiting: 45 })).toEqual({
      key: "batch.sendingPhotos",
      values: { active: 2, waiting: 45 },
    });
    expect(batchSentence({ ...base, photos: false, active: 1, paused: 1 }).key).toBe("batch.sendingFiles");
    expect(batchSentence({ ...base, direction: "download", active: 1 }).key).toBe("batch.downloading");
  });
  it("waiting, paused and offline", () => {
    expect(batchSentence({ ...base, waiting: 3 })).toEqual({ key: "batch.waiting", values: { count: 3 } });
    expect(batchSentence({ ...base, paused: 2, waiting: 3 })).toEqual({ key: "batch.paused", values: { count: 5 } });
    expect(batchSentence({ ...base, active: 2, online: false })).toEqual({ key: "batch.offline" });
  });
  it("when everything settled", () => {
    expect(batchSentence({ ...base, done: 103, failed: 1 })).toEqual({
      key: "batch.savedSomeFailed",
      values: { count: 103, folder: "Family", failed: 1 },
    });
    expect(batchSentence({ ...base, done: 4 })).toEqual({
      key: "batch.saved",
      values: { count: 4, folder: "Family" },
    });
    expect(batchSentence({ ...base, failed: 2 })).toEqual({ key: "batch.allFailed", values: { failed: 2 } });
    expect(batchSentence({ ...base, direction: "download", done: 2 })).toEqual({
      key: "batch.downloaded",
      values: { count: 2 },
    });
    expect(batchSentence({ ...base, direction: "download", done: 2, failed: 1 }).key).toBe(
      "batch.downloadedSomeFailed",
    );
  });
});

describe("translateLabel", () => {
  const t = (key: string, values?: Record<string, string | number>) =>
    values ? `${key}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(",")})` : key;
  it("translates plain and nested labels", () => {
    expect(translateLabel(t, { key: "progress.ready" })).toBe("progress.ready");
    expect(
      translateLabel(t, { key: "progress.sendingEta", values: { time: { key: "time.fewSeconds" }, n: 2 } }),
    ).toBe("progress.sendingEta(time=time.fewSeconds,n=2)");
  });
});
