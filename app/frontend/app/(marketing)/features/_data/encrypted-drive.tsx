import { ChevronRight, Search, Eye, Lock, FolderOpen, LayoutGrid } from "@/lib/icons";
import {
  pageText,
  commonText,
  related,
  caps,
  cta,
  hero,
  section,
  checklist,
  type FeaturePageData,
} from "./t";

export type EncryptedDrivePageData = FeaturePageData<typeof FolderOpen>;

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
