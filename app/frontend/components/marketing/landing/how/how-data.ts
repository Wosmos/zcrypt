import { hexChar } from "@/components/marketing/landing/gsap";
import { STORAGE_PLATFORMS } from "@/components/marketing/landing/storage-platforms";

export type HowPart = "connect" | "drop" | "store";

export const STEPS: ReadonlyArray<{ n: string; part: HowPart }> = [
  { n: "01", part: "connect" },
  { n: "02", part: "drop" },
  { n: "03", part: "store" },
];

export const PLATFORMS = STORAGE_PLATFORMS.map((p) => ({ ...p, key: p.id }));

export const FILE = { name: "wedding-video.mp4", size: "4.2 GB", ext: "MP4" };

export type Caption = { k: string } | { raw: string };

export const CAPTIONS: Record<HowPart, readonly Caption[]> = {
  connect: [{ k: "site.home.how.caps.accounts" }],
  drop: [
    { raw: `${FILE.name} · ${FILE.size}` },
    { k: "site.home.how.caps.cut" },
    { k: "site.home.how.caps.locked" },
  ],
  store: [{ k: "site.home.how.caps.saved" }, { k: "site.home.how.caps.spotFilled" }],
};

export const PIECES = 4;

export function pieceHex(i: number): [string, string] {
  const line = (k: number) =>
    Array.from({ length: 8 }, (_, j) => hexChar(i * 97 + k * 13 + j + 7)).join("");
  return [line(0), line(1)];
}
