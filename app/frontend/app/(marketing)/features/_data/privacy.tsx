import { Layers, Users, ShieldCheck } from "@/lib/icons";
import type { ReactNode } from "react";
import {
  pageText,
  commonText,
  related,
  cta,
  hero as heroBase,
  checklist,
  type HeroData,
  type CtaData,
  type RelatedItem,
} from "./t";

export interface PrivacyPageData {
  hero: HeroData & { trustLine: ReactNode };
  decoy: {
    eyebrow: ReactNode;
    heading: ReactNode;
    body: ReactNode;
    points: ReactNode[];
  };
  deadMansSwitch: {
    eyebrow: ReactNode;
    heading: ReactNode;
    body: ReactNode;
    does: ReactNode[];
    doesNot: ReactNode[];
    doesNotFootnote: ReactNode;
  };
  betaSection: { heading: ReactNode; subheading: ReactNode };
  betaTools: {
    Icon: typeof Layers;
    title: ReactNode;
    desc: ReactNode;
    caveat: ReactNode;
    href: string;
  }[];
  zeroKnowledgeTieIn: { heading: ReactNode; body: ReactNode };
  related: RelatedItem[];
  cta: CtaData;
}

const tx = pageText("privacy");

export const privacy: PrivacyPageData = {
  hero: {
    ...heroBase(tx, commonText("readDocs"), "/docs/decoy-profile"),
    trustLine: (
      <>
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
        {tx("hero.trustLine")}
      </>
    ),
  },
  decoy: {
    eyebrow: tx("decoy.eyebrow"),
    heading: tx("decoy.heading"),
    body: tx("decoy.body"),
    points: checklist(tx, "decoy.point", 3),
  },
  deadMansSwitch: {
    eyebrow: tx("dms.eyebrow"),
    heading: tx("dms.heading"),
    body: tx("dms.body"),
    does: checklist(tx, "dms.does", 3),
    doesNot: checklist(tx, "dms.doesNot", 3),
    doesNotFootnote: tx("dms.footnote"),
  },
  betaSection: { heading: tx("beta.heading"), subheading: tx("beta.subheading") },
  betaTools: [
    {
      Icon: Layers,
      title: tx("beta.snapshots.title"),
      desc: tx("beta.snapshots.desc"),
      caveat: tx("beta.snapshots.caveat"),
      href: "/docs/snapshots-integrity",
    },
    {
      Icon: Users,
      title: tx("beta.shared.title"),
      desc: tx("beta.shared.desc"),
      caveat: tx("beta.shared.caveat"),
      href: "/docs/shared-vaults",
    },
  ],
  zeroKnowledgeTieIn: { heading: tx("core.heading"), body: tx("core.body") },
  related: related(tx, [
    ["/features/encrypted-drive", "drive"],
    ["/docs/dead-mans-switch", "dms"],
    ["/docs/security", "security"],
  ]),
  cta: cta(tx),
};
