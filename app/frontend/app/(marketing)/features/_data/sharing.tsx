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
  type SectionData,
  type FeaturePageData,
} from "./t";

export interface SharingPageData extends FeaturePageData<typeof Link2> {
  moreWaysSection: SectionData;
  moreWays: { title: ReactNode; desc: ReactNode }[];
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
