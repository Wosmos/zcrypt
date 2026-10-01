import type { ComponentType } from "react";
import { GitHubIcon } from "@/components/icons/github";
import { GitlabIcon } from "@/components/icons/gitlab";
import { HuggingFaceIcon } from "@/components/icons/huggingface";
import { TelegramIcon } from "@/components/icons/telegram";
import { PLATFORM_NAMES, type PlatformId } from "@/lib/platforms";

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
    id: "telegram",
    name: PLATFORM_NAMES.telegram,
    Mark: TelegramIcon,
    tint: "#0ea5e9",
    limit: "No ceiling",
    capacity: "50 MB / file",
    note: "Many small chunks, spread wide.",
  },
  {
    id: "github",
    name: PLATFORM_NAMES.github,
    Mark: GitHubIcon,
    tint: "var(--color-text)",
    limit: "850 MB per project",
    capacity: "850 MB / repo",
    note: "The default. Spin up as many repos as you like.",
  },
  {
    id: "gitlab",
    name: PLATFORM_NAMES.gitlab,
    Mark: GitlabIcon,
    tint: "#f97316",
    limit: "9 GB per project",
    capacity: "9 GB / repo",
    note: "Roomier repos for heavier vaults.",
  },
  {
    id: "huggingface",
    name: PLATFORM_NAMES.huggingface,
    Mark: HuggingFaceIcon,
    tint: "#eab308",
    limit: "90 GB per account",
    capacity: "90 GB / account",
    note: "Built for large files, serious headroom.",
  },
];
