import type { ComponentType } from "react";
import { hexChar } from "@/components/marketing/preview/gsap";
import {
  GitHubIcon,
  GitLabIcon,
  HuggingFaceIcon,
  TelegramIcon,
} from "@/components/marketing/preview/platform-marks";

export type HowPart = "connect" | "drop" | "store";

export const STEPS: ReadonlyArray<{ n: string; part: HowPart; title: string; body: string }> = [
  {
    n: "01",
    part: "connect",
    title: "Connect your account",
    body: "Link an account you already have: Telegram, GitHub, GitLab or Hugging Face. That's where your files will live. Not with us.",
  },
  {
    n: "02",
    part: "drop",
    title: "Drop a file",
    body: "Your device cuts it into pieces and locks each one with a key made from your password. The key never leaves your device.",
  },
  {
    n: "03",
    part: "store",
    title: "Stored in your own cloud",
    body: "The locked pieces go to your account under dull names. When a spot fills up, zcrypt opens a fresh one. Telegram has no ceiling, so neither do you.",
  },
];

export const PLATFORMS: ReadonlyArray<{
  key: "telegram" | "github" | "gitlab" | "huggingface";
  name: string;
  limit: string;
  tint: string;
  Mark: ComponentType<{ className?: string }>;
}> = [
  { key: "telegram", name: "Telegram", limit: "No ceiling", tint: "#0ea5e9", Mark: TelegramIcon },
  {
    key: "github",
    name: "GitHub",
    limit: "850 MB per project",
    tint: "var(--color-text)",
    Mark: GitHubIcon,
  },
  { key: "gitlab", name: "GitLab", limit: "9 GB per project", tint: "#f97316", Mark: GitLabIcon },
  {
    key: "huggingface",
    name: "Hugging Face",
    limit: "90 GB per account",
    tint: "#eab308",
    Mark: HuggingFaceIcon,
  },
];

export const FILE = { name: "wedding-video.mp4", size: "4.2 GB", ext: "MP4" };

export const CAPTIONS: Record<HowPart, readonly string[]> = {
  connect: ["Your accounts"],
  drop: [`${FILE.name} · ${FILE.size}`, "Cut into pieces", "Each piece locked on this device"],
  store: ["Saved to your accounts under dull names", "A spot filled up. zcrypt opened a new one."],
};

export const PIECES = 4;

export function pieceHex(i: number): [string, string] {
  const line = (k: number) =>
    Array.from({ length: 8 }, (_, j) => hexChar(i * 97 + k * 13 + j + 7)).join("");
  return [line(0), line(1)];
}
