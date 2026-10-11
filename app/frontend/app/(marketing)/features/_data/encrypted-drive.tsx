import { ChevronRight, Search, Eye, Lock, FolderOpen, LayoutGrid } from "@/lib/icons";
import type { ReactNode } from "react";
import {
  pageText,
  commonText,
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

export interface EncryptedDrivePageData {
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

const tx = pageText("encryptedDrive");

export const encryptedDrive: EncryptedDrivePageData = {
  hero: hero(tx, commonText("readDocs"), "/docs/folders"),
  capabilitiesSection: section(tx, "capSection"),
  capabilities: caps(tx, "caps", [
    ["folders", FolderOpen],
    ["breadcrumbs", ChevronRight],
    ["views", LayoutGrid],
    ["search", Search],
    ["preview", Eye],
    ["names", Lock],
  ]),
  tieIn: {
    eyebrow: tx("tieIn.eyebrow"),
    heading: tx("tieIn.heading"),
    body: tx("tieIn.body"),
    checklistItems: checklist(tx, "tieIn.check", 3),
    linkLabel: tx("tieIn.linkLabel"),
    linkHref: "/features/encryption",
  },
  related: related(tx, [
    ["/features/folders", "folders"],
    ["/features/file-viewers", "viewers"],
    ["/features/transfers", "transfers"],
  ]),
  cta: cta(tx),
};
