/**
 * Canonical audio/video format tables — the ONE place that decides whether a
 * filename is playable media, which skin it gets, and its MIME type. Imported by
 * the viewer dispatch (viewer-kind.ts), the decryptor's blob typing
 * (useFileDecryptor.ts), the file-type/icon logic (lib/utils.ts) and the player
 * itself (media-player.tsx) so none of them can drift apart again.
 *
 * Pure (no React/DOM) so it can be imported anywhere and unit-tested.
 *
 * Note on recognition vs. playback: recognising a file as audio/video only
 * routes it to the player. Whether the browser can actually DECODE it is a
 * separate matter (WebKit/Chromium play mp4/webm/ogg + mp3/aac/flac/wav/opus
 * reliably; avi/wmv/flv/mkv/mpeg-video usually not). The player attempts
 * playback and falls back to a Download panel on error, so broad recognition is
 * safe — an unplayable-but-known type still gets the right icon and a clean exit.
 */

// MPEG containers (.mpeg/.mpg/.mpe/.mpga) are treated as AUDIO on purpose:
// browsers can't decode MPEG-1/2 *video*, while the overwhelmingly common
// real-world case — WhatsApp/consumer voice notes — is MP3 audio wearing a
// .mpeg extension. So we map them to audio/mpeg, which actually plays.
export const AUDIO_EXTENSIONS = new Set([
  "mp3", "mpeg", "mpg", "mpe", "mpga",
  "m4a", "m4b", "aac", "wav", "wave",
  "flac", "ogg", "oga", "opus", "weba",
  "wma", "aiff", "aif", "aifc", "amr",
  "ac3", "mka", "ape", "3ga", "mid", "midi",
]);

export const VIDEO_EXTENSIONS = new Set([
  "mp4", "m4v", "mov", "qt", "webm",
  "mkv", "ogv", "ogm", "avi", "wmv",
  "flv", "f4v", "3gp", "3g2", "ts",
  "mts", "m2ts", "vob", "asf", "divx", "mxf",
]);

/** MIME type by extension for media only (octet-stream fallback handled by callers). */
export const MEDIA_MIME_BY_EXT: Record<string, string> = {
  // audio
  mp3: "audio/mpeg", mpeg: "audio/mpeg", mpg: "audio/mpeg", mpe: "audio/mpeg", mpga: "audio/mpeg",
  m4a: "audio/mp4", m4b: "audio/mp4", aac: "audio/aac", wav: "audio/wav", wave: "audio/wav",
  flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", weba: "audio/webm",
  wma: "audio/x-ms-wma", aiff: "audio/aiff", aif: "audio/aiff", aifc: "audio/aiff", amr: "audio/amr",
  ac3: "audio/ac3", mka: "audio/x-matroska", ape: "audio/x-ape", "3ga": "audio/3gpp",
  mid: "audio/midi", midi: "audio/midi",
  // video
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", qt: "video/quicktime",
  webm: "video/webm", mkv: "video/x-matroska", ogv: "video/ogg", ogm: "video/ogg",
  avi: "video/x-msvideo", wmv: "video/x-ms-wmv", flv: "video/x-flv", f4v: "video/mp4",
  "3gp": "video/3gpp", "3g2": "video/3gpp2", ts: "video/mp2t", mts: "video/mp2t",
  m2ts: "video/mp2t", vob: "video/mpeg", asf: "video/x-ms-asf", divx: "video/x-msvideo",
  mxf: "application/mxf",
};

/** Lowercased extension (no dot) of a filename, or "" if none. */
export function extOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isAudioFile(filename: string): boolean {
  return AUDIO_EXTENSIONS.has(extOf(filename));
}

export function isVideoFile(filename: string): boolean {
  return VIDEO_EXTENSIONS.has(extOf(filename));
}

export function isMediaFile(filename: string): boolean {
  return isAudioFile(filename) || isVideoFile(filename);
}

/** Which player skin a filename should use, or null if it isn't media. */
export function mediaKindFor(filename: string): "audio" | "video" | null {
  const ext = extOf(filename);
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}

/** MIME for a media filename, or undefined if it isn't recognised media. */
export function mediaMimeFor(filename: string): string | undefined {
  return MEDIA_MIME_BY_EXT[extOf(filename)];
}
