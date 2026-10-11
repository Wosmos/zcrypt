import { Clock, Pause, Play, RefreshCw, Archive, Upload } from "@/lib/icons";
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
  type FeaturePageData,
} from "./t";

export interface TransfersPageData extends FeaturePageData<typeof Clock> {
  deviceToDevice: {
    eyebrow: ReactNode;
    heading: ReactNode;
    body: ReactNode;
    checklistItems: ReactNode[];
  };
}

const tx = pageText("transfers");

export const transfers: TransfersPageData = {
  hero: hero(tx, commonText("readDocs"), "/docs/transfer-manager"),
  capabilitiesSection: section(tx, "capSection"),
  capabilities: caps(tx, "caps", [
    ["progress", Clock],
    ["pause", Pause],
    ["resume", Play],
    ["retry", RefreshCw],
    ["zip", Archive],
    ["navigation", Upload],
  ]),
  tieIn: {
    eyebrow: tx("tieIn.eyebrow"),
    heading: tx("tieIn.heading"),
    body: tx("tieIn.body"),
    checklistItems: checklist(tx, "tieIn.check", 4),
    linkLabel: tx("tieIn.linkLabel"),
    linkHref: "/docs/uploading",
  },
  deviceToDevice: {
    eyebrow: tx("d2d.eyebrow"),
    heading: tx("d2d.heading"),
    body: tx("d2d.body"),
    checklistItems: checklist(tx, "d2d.check", 3),
  },
  related: related(tx, [
    ["/features/encrypted-drive", "drive"],
    ["/docs/transfer-manager", "docs"],
    ["/docs/uploading", "uploading"],
  ]),
  cta: cta(tx),
};
