import { FolderOpen, Lock, Key, Shield, RefreshCw, Layers } from "@/lib/icons";
import type { ReactNode } from "react";
import {
  pageText,
  related,
  caps,
  cta,
  hero,
  section,
  checklist,
  type HeroData,
  type CtaData,
  type SectionData,
  type RelatedItem,
  type CapabilityData,
} from "./t";

export interface FoldersPageData {
  hero: HeroData;
  capabilitiesSection: SectionData;
  capabilities: CapabilityData<typeof FolderOpen>[];
  tieIn: {
    eyebrow: ReactNode;
    heading: ReactNode;
    body: ReactNode;
    checklistItems: ReactNode[];
    linkLabel: ReactNode;
    linkHref: string;
  };
  related: RelatedItem[];
  cta: CtaData;
}

const tx = pageText("folders");

export const folders: FoldersPageData = {
  hero: hero(tx, pageText("common")("readDocs"), "/docs/folder-encryption"),
  capabilitiesSection: section(tx, "capSection"),
  capabilities: caps(tx, "caps", [
    ["nestable", FolderOpen],
    ["names", Lock],
    ["password", Key],
    ["sealed", Shield],
    ["rekey", RefreshCw],
    ["verified", Layers],
  ]),
  tieIn: {
    eyebrow: tx("tieIn.eyebrow"),
    heading: tx("tieIn.heading"),
    body: tx("tieIn.body"),
    checklistItems: checklist(tx, "tieIn.check", 4),
    linkLabel: tx("tieIn.linkLabel"),
    linkHref: "/docs/folder-encryption",
  },
  related: related(tx, [
    ["/features/encrypted-drive", "drive"],
    ["/docs/folders", "docsFolders"],
    ["/docs/folder-encryption", "docsEncryption"],
  ]),
  cta: cta(tx),
};
