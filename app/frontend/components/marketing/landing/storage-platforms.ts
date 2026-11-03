import type { ComponentType } from "react";
import { GitHubIcon } from "@/components/icons/github";
import { GitlabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";
import { TelegramIcon } from "@/components/icons/telegram";
import { PLATFORM_NAMES, Platform, type PlatformId } from "@/lib/platforms";

export interface StoragePlatform {
  id: PlatformId;
  name: string;
  Mark: ComponentType<{ className?: string }>;
  tint: string;
  limit: string;
  capacity: string;
  note: string;
}

export const STORAGE_PLATFORMS: readonly StoragePlatform[] = [
  {
    id: Platform.Telegram,
    name: PLATFORM_NAMES[Platform.Telegram],
    Mark: TelegramIcon,
    tint: "#0ea5e9",
    limit: "No ceiling",
    capacity: "50 MB / file",
    note: "Many small chunks, spread wide.",
  },
  {
    id: Platform.Github,
    name: PLATFORM_NAMES[Platform.Github],
    Mark: GitHubIcon,
    tint: "var(--color-text)",
    limit: "850 MB per project",
    capacity: "850 MB / repo",
    note: "The default. Spin up as many repos as you like.",
  },
  {
    id: Platform.Gitlab,
    name: PLATFORM_NAMES[Platform.Gitlab],
    Mark: GitlabIcon,
    tint: "#f97316",
    limit: "9 GB per project",
    capacity: "9 GB / repo",
    note: "Roomier repos for heavier vaults.",
  },
  {
    id: Platform.HuggingFace,
    name: PLATFORM_NAMES[Platform.HuggingFace],
    Mark: HuggingFaceIcon,
    tint: "#eab308",
    limit: "90 GB per account",
    capacity: "90 GB / account",
    note: "Built for large files, serious headroom.",
  },
];
