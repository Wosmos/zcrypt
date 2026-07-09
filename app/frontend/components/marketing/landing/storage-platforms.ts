import { Github, GitBranch, Layers, Send } from "@/lib/icons";
import { PLATFORM_NAMES, type PlatformId } from "@/lib/platforms";

// Marketing display data for the "bring your own storage" story, shared by the
// bento grid, the landing fan-out diagram, and the features/bring-your-own-storage
// page. Deliberately uses generic geometric icons + brand color classes + the
// precise platform thresholds (distinct from the rounded, app-facing capacities
// in lib/platforms). Names come from the canonical source there.

export interface StoragePlatform {
  id: PlatformId;
  name: string;
  Icon: (props: { className?: string }) => React.ReactNode;
  /** Tailwind brand color class for the glyph. */
  colorClass: string;
  /** Precise platform threshold, e.g. "850 MB / repo". */
  capacity: string;
  /** One-line marketing note (used on the features page). */
  note: string;
}

export const STORAGE_PLATFORMS: StoragePlatform[] = [
  {
    id: "github",
    name: PLATFORM_NAMES.github,
    Icon: Github,
    colorClass: "text-[var(--color-text)]",
    capacity: "850 MB / repo",
    note: "The default. Spin up as many repos as you like.",
  },
  {
    id: "gitlab",
    name: PLATFORM_NAMES.gitlab,
    Icon: GitBranch,
    colorClass: "text-[#fc6d26]",
    capacity: "9 GB / repo",
    note: "Roomier repos for heavier vaults.",
  },
  {
    id: "huggingface",
    name: PLATFORM_NAMES.huggingface,
    Icon: Layers,
    colorClass: "text-[#ffd21e]",
    capacity: "90 GB / repo",
    note: "Built for large files — serious headroom.",
  },
  {
    id: "telegram",
    name: PLATFORM_NAMES.telegram,
    Icon: Send,
    colorClass: "text-[#26a5e4]",
    capacity: "50 MB / file",
    note: "Many small chunks, spread wide.",
  },
];
