import { FolderOpen, Lock, Key, Shield, RefreshCw, Layers } from "@/lib/icons";
import { pageText, related, caps, cta, hero, section, checklist, type FeaturePageData } from "./t";

export type FoldersPageData = FeaturePageData<typeof FolderOpen>;

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
