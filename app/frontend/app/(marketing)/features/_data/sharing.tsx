import { Link2, Lock, Clock, Download, XCircle, Eye } from "@/lib/icons";
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

export interface SharingPageData {
  hero: HeroData;
  capabilitiesSection: SectionData;
  capabilities: CapabilityData<typeof Link2>[];
  tieIn: {
    eyebrow: ReactNode;
    heading: ReactNode;
    body: ReactNode;
    checklistItems: ReactNode[];
    linkLabel: ReactNode;
    linkHref: string;
  };
  moreWaysSection: SectionData;
  moreWays: { title: ReactNode; desc: ReactNode }[];
  related: RelatedItem[];
  cta: CtaData;
}

const tx = pageText("sharing");

export const sharing: SharingPageData = {
  hero: hero(tx, commonText("readDocs"), "/docs/sharing"),
  capabilitiesSection: section(tx, "capSection"),
  capabilities: caps(tx, "caps", [
    ["fragment", Link2],
    ["password", Lock],
    ["expiry", Clock],
    ["limits", Download],
    ["revoke", XCircle],
    ["noAccount", Eye],
  ]),
  tieIn: {
    eyebrow: tx("tieIn.eyebrow"),
    heading: tx("tieIn.heading"),
    body: tx("tieIn.body"),
    checklistItems: checklist(tx, "tieIn.check", 4),
    linkLabel: tx("tieIn.linkLabel"),
    linkHref: "/docs/sharing",
  },
  moreWaysSection: section(tx, "moreWays"),
  moreWays: [
    { title: tx("moreWays.send.title"), desc: tx("moreWays.send.desc") },
    { title: tx("moreWays.pad.title"), desc: tx("moreWays.pad.desc") },
  ],
  related: related(tx, [
    ["/features/encrypted-drive", "drive"],
    ["/docs/sharing", "docs"],
    ["/register", "register"],
  ]),
  cta: cta(tx),
};
