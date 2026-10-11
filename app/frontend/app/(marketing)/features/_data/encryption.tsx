import { Cpu, Key, Lock, Folder, Server, ShieldCheck } from "@/lib/icons";
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
} from "./t";

export interface EncryptionPageData {
  hero: HeroData;
  boundary: {
    device: { title: ReactNode; items: ReactNode[] };
    server: { title: ReactNode; items: ReactNode[] };
  };
  guarantees: CapabilityData<typeof Cpu>[];
  pipelineSection: { eyebrow: ReactNode; heading: ReactNode; subheading: ReactNode };
  pipeline: { step: string; title: ReactNode; desc: ReactNode }[];
  tieIn: {
    heading: ReactNode;
    body: ReactNode;
    checklist: ReactNode;
    linkLabel: ReactNode;
    linkHref: string;
    panelIntro: ReactNode[];
  };
  related: RelatedItem[];
  cta: CtaData;
}

const tx = pageText("encryption");

const PIPELINE: [string, string][] = [
  ["01", "derive"],
  ["02", "seal"],
  ["03", "chunk"],
  ["04", "upload"],
];

export const encryption: EncryptionPageData = {
  hero: hero(tx, commonText("readDocs"), "/docs/zero-knowledge"),
  boundary: {
    device: {
      title: tx("boundary.device.title"),
      items: checklist(tx, "boundary.device.item", 4),
    },
    server: {
      title: tx("boundary.server.title"),
      items: checklist(tx, "boundary.server.item", 4),
    },
  },
  guarantees: caps(tx, "guarantees", [
    ["device", Cpu],
    ["key", Key],
    ["unique", Lock],
    ["names", Folder],
    ["server", Server],
    ["tamper", ShieldCheck],
  ]),
  pipelineSection: {
    eyebrow: tx("pipeline.eyebrow"),
    heading: tx("pipeline.heading"),
    subheading: tx("pipeline.subheading"),
  },
  pipeline: PIPELINE.map(([step, id]) => ({
    step,
    title: tx(`pipeline.${id}.title`),
    desc: tx(`pipeline.${id}.desc`),
  })),
  tieIn: {
    heading: tx("tieIn.heading"),
    body: tx("tieIn.body"),
    checklist: (
      <p className="mt-4 leading-relaxed text-[var(--color-text-secondary)]">{tx("tieIn.note")}</p>
    ),
    linkLabel: tx("tieIn.linkLabel"),
    linkHref: "/docs/security",
    panelIntro: checklist(tx, "tieIn.panel", 4),
  },
  related: related(tx, [
    ["/features/encrypted-drive", "drive"],
    ["/docs/zero-knowledge", "zk"],
    ["/docs/security", "security"],
  ]),
  cta: cta(tx),
};
