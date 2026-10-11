import { HardDrive, RefreshCw, Infinity as InfinityIcon, Lock, Server, Layers } from "@/lib/icons";
import type { ReactNode } from "react";
import {
  pageText,
  commonText,
  related,
  caps,
  cta,
  hero,
  checklist,
  type HeroData,
  type CtaData,
  type RelatedItem,
  type CapabilityData,
  type TieInData,
} from "./t";

export interface BringYourOwnStoragePageData {
  hero: HeroData;
  adaptersSection: {
    eyebrow: ReactNode;
    heading: ReactNode;
    subheading: ReactNode;
    footnote: ReactNode;
  };
  capabilities: CapabilityData<typeof Layers>[];
  tieIn: TieInData;
  related: RelatedItem[];
  cta: CtaData;
}

const tx = pageText("byos");

export const bringYourOwnStorage: BringYourOwnStoragePageData = {
  hero: hero(tx, commonText("readDocs"), "/docs/platform-adapters"),
  adaptersSection: {
    eyebrow: tx("adapters.eyebrow"),
    heading: tx("adapters.heading"),
    subheading: tx("adapters.subheading"),
    footnote: tx("adapters.footnote"),
  },
  capabilities: caps(tx, "caps", [
    ["split", Layers],
    ["rotation", RefreshCw],
    ["grows", InfinityIcon],
    ["disguised", Lock],
    ["infra", Server],
    ["noLockin", HardDrive],
  ]),
  tieIn: {
    eyebrow: tx("tieIn.eyebrow"),
    heading: tx("tieIn.heading"),
    body: tx("tieIn.body"),
    checklistItems: checklist(tx, "tieIn.check", 4),
    linkLabel: tx("tieIn.linkLabel"),
    linkHref: "/docs/repo-pool",
  },
  related: related(tx, [
    ["/features/encrypted-drive", "drive"],
    ["/docs/platform-adapters", "adapters"],
    ["/docs/repo-pool", "pool"],
  ]),
  cta: cta(tx),
};
