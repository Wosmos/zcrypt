/**
 * Shared viewer-type dispatch. Maps a filename → the sub-viewer that should
 * render it. Unifies `getFileCategory` with the media-player's extension lists
 * and the document/text-ish extensions the explorer can hold, so dispatch never
 * disagrees with what each viewer can actually handle.
 *
 * Pure (no React, no DOM) so it can be imported by both the dispatcher and tests.
 */

import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from "@/lib/media-formats";

export type ViewerKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "docx"
  | "html"
  | "markdown"
  | "csv"
  | "text"
  | "fallback";

const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico"];
const MARKDOWN_EXT = ["md", "markdown", "mdown", "mkd"];
const CSV_EXT = ["csv", "tsv"];
// Text/code that renders as a monospace pane with optional highlight.js.
const TEXT_EXT = [
  "txt", "log", "json", "xml", "yaml", "yml", "toml", "ini", "cfg", "env",
  "js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "go", "rs", "java", "kt",
  "c", "h", "cpp", "cc", "hpp", "cs", "rb", "php", "swift", "css", "scss",
  "less", "sh", "bash", "zsh", "sql", "graphql", "gql", "dockerfile", "make",
  "gitignore", "diff", "patch",
];

/** Pick the sub-viewer for a filename. Order matters (specific → general). */
export function viewerKindFor(filename: string): ViewerKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXT.includes(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "html" || ext === "htm") return "html";
  if (MARKDOWN_EXT.includes(ext)) return "markdown";
  if (CSV_EXT.includes(ext)) return "csv";
  if (TEXT_EXT.includes(ext)) return "text";
  return "fallback";
}

/** True for kinds the MediaPlayer handles (so the dispatcher can build a playlist). */
export function isMediaKind(kind: ViewerKind): kind is "audio" | "video" {
  return kind === "audio" || kind === "video";
}

/** Map of bytes for the highlight.js language hint, keyed by extension. */
export function hljsLanguageFor(filename: string): string | undefined {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
    ts: "typescript", tsx: "typescript", py: "python", go: "go", rs: "rust",
    java: "java", kt: "kotlin", c: "c", h: "c", cpp: "cpp", cc: "cpp",
    hpp: "cpp", cs: "csharp", rb: "ruby", php: "php", swift: "swift",
    css: "css", scss: "scss", less: "less", sh: "bash", bash: "bash",
    zsh: "bash", sql: "sql", json: "json", xml: "xml", html: "xml",
    yaml: "yaml", yml: "yaml", toml: "ini", ini: "ini", graphql: "graphql",
    gql: "graphql", diff: "diff", patch: "diff", dockerfile: "dockerfile",
  };
  return map[ext];
}
