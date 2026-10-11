type Translate = (key: string, values?: Record<string, string | number>) => string;

const EXACT: Record<string, string> = {
  Paused: "stage.paused",
  Queued: "stage.queued",
  Done: "stage.done",
  Failed: "stage.failed",
  Cancelled: "stage.cancelled",
  "Resuming…": "stage.resuming",
  "Retrying...": "stage.retrying",
  "Retrying…": "stage.retrying",
  "Uploading...": "stage.uploading",
  Uploading: "stage.uploading",
  Downloading: "stage.downloading",
  "Finalizing...": "stage.finalizing",
  "Hashing file…": "stage.hashing",
  "Deriving encryption key...": "stage.derivingKey",
  "Deriving key...": "stage.derivingKey",
  "Starting upload session...": "stage.startingSession",
  "Choose where to save…": "stage.chooseSave",
  "Fetching metadata...": "stage.fetchingMeta",
  "Verifying integrity...": "stage.verifying",
  "Saving file...": "stage.savingFile",
  "Saving ZIP...": "stage.savingZip",
  "Starting ZIP...": "stage.startingZip",
  hashing: "stage.hashing",
  deriving_key: "stage.derivingKey",
  processing: "stage.processing",
  encrypting: "stage.encrypting",
  uploading: "stage.uploading",
  finalizing: "stage.finalizing",
  done: "stage.done",
};

const ERRORS: Record<string, string> = {
  Failed: "stage.failed",
  "Upload failed": "stage.uploadFailed",
  "Download failed": "stage.downloadFailed",
  "ZIP download failed": "stage.zipFailed",
  "Too large to download in this browser": "stage.tooLargeDownload",
  "Too large to ZIP in this browser": "stage.tooLargeZip",
  "Choose where to save the ZIP": "stage.chooseZipSave",
  "Can't reach zcrypt's servers (network/DNS)": "stage.unreachable",
  "No storage platform connected. Go to Settings to connect one.": "stage.noPlatform",
};

export function localizeStage(t: Translate, stage: string): string {
  const exact = EXACT[stage];
  if (exact) return t(exact);

  const counted = /^(.*) \((\d+)\/(\d+)\)$/.exec(stage);
  if (counted && counted[1] && EXACT[counted[1]]) {
    return t("stage.withCount", {
      stage: t(EXACT[counted[1]]),
      index: Number(counted[2]),
      total: Number(counted[3]),
    });
  }

  let m = /^Hashing file… (\d+)%$/.exec(stage);
  if (m) return t("stage.hashingPercent", { percent: Number(m[1]) });
  m = /^Uploading chunk (\d+)\/(\d+)$/.exec(stage);
  if (m) return t("stage.uploadingChunk", { current: Number(m[1]), total: Number(m[2]) });
  m = /^Downloading (\d+)\/(\d+)$/.exec(stage);
  if (m) return t("stage.downloadingChunks", { current: Number(m[1]), total: Number(m[2]) });
  m = /^Waiting for slot \((\d+)\)\.\.\.$/.exec(stage);
  if (m) return t("stage.waitingSlot", { attempt: Number(m[1]) });
  m = /^Downloading (.+)$/.exec(stage);
  if (m) return t("stage.downloadingFile", { name: m[1] });
  return stage;
}

export function localizeError(t: Translate, error: string): string {
  const key = ERRORS[error];
  return key ? t(key) : error;
}
