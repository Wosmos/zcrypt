import {
  Image as ImageIcon,
  Video,
  FileText,
  Code,
  Table,
  Play,
  Search,
  Download,
  Layers,
  RefreshCcw,
  Monitor,
} from "@/lib/icons";
import type { ReactNode } from "react";
import {
  pageText,
  related,
  caps,
  cta,
  hero,
  section,
  type HeroData,
  type CtaData,
  type SectionData,
  type RelatedItem,
  type CapabilityData,
} from "./t";

export interface FileViewersPageData {
  hero: HeroData;
  viewersSection: SectionData;
  viewers: CapabilityData<typeof ImageIcon>[];
  zeroKnowledgeSection: { eyebrow: ReactNode; heading: ReactNode; subheading: ReactNode };
  pipeline: { step: string; title: ReactNode; desc: ReactNode }[];
  memoryNote: ReactNode;
  overlaySection: SectionData;
  overlayFeatures: CapabilityData<typeof Layers>[];
  related: RelatedItem[];
  cta: CtaData;
}

const tx = pageText("fileViewers");

const PIPELINE: [string, string][] = [
  ["01", "fetch"],
  ["02", "decrypt"],
  ["03", "verify"],
  ["04", "render"],
];

export const fileViewers: FileViewersPageData = {
  hero: hero(tx, tx("hero.secondaryLabel"), "/docs/how-it-works"),
  viewersSection: section(tx, "viewersSection"),
  viewers: caps(tx, "viewers", [
    ["images", ImageIcon],
    ["media", Video],
    ["pdf", FileText],
    ["docx", FileText],
    ["html", Code],
    ["markdown", FileText],
    ["csv", Table],
    ["code", Code],
  ]),
  zeroKnowledgeSection: {
    eyebrow: tx("zk.eyebrow"),
    heading: tx("zk.heading"),
    subheading: tx("zk.subheading"),
  },
  pipeline: PIPELINE.map(([step, id]) => ({
    step,
    title: tx(`pipeline.${id}.title`),
    desc: tx(`pipeline.${id}.desc`),
  })),
  memoryNote: tx("memoryNote"),
  overlaySection: section(tx, "overlay"),
  overlayFeatures: caps(tx, "overlayFeatures", [
    ["walk", Layers],
    ["fullscreen", Monitor],
    ["playlist", Play],
    ["errors", RefreshCcw],
    ["instant", Search],
    ["download", Download],
  ]),
  related: related(tx, [
    ["/features/encrypted-drive", "drive"],
    ["/docs/how-it-works", "how"],
    ["/docs/folders", "folders"],
  ]),
  cta: cta(tx),
};
