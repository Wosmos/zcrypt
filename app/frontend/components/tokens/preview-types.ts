import { extOf } from "@/lib/utils";

export type PreviewType = "image" | "video" | "audio" | "none";

const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico"];
const VIDEO_EXT = ["mp4", "webm", "ogg", "mov"];
const AUDIO_EXT = ["mp3", "wav", "aac", "flac", "m4a"];

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "video/ogg",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  pdf: "application/pdf",
  zip: "application/zip",
  txt: "text/plain",
};

export function getPreviewType(filename: string): PreviewType {
  const ext = extOf(filename);
  if (IMAGE_EXT.includes(ext)) return "image";
  if (VIDEO_EXT.includes(ext)) return "video";
  if (AUDIO_EXT.includes(ext)) return "audio";
  return "none";
}

export function getMimeType(filename: string): string | undefined {
  return MIME_BY_EXT[extOf(filename)];
}
