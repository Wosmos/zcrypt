import { LegalDocument } from "@/components/legal/legal-body";
import { PRIVACY_EMAIL } from "@/lib/site";

const SECTIONS = [
  {
    id: "privacy-who",
    key: "s1",
    blocks: [{ p: "p1" }, { p: "p2" }],
  },
  {
    id: "privacy-cannot-see",
    key: "s2",
    blocks: [
      { p: "p1" },
      { ul: ["l1", "l2", "l3"] },
      { p: "p2" },
      { ul: ["l4", "l5", "l6", "l7"] },
    ],
  },
  {
    id: "privacy-collect",
    key: "s3",
    blocks: [
      { p: "p1" },
      { h: "h1" },
      { ul: ["l1", "l2", "l3", "l4"] },
      { h: "h2" },
      { ul: ["l5", "l6", "l7"] },
      { h: "h3" },
      { ul: ["l8", "l9"] },
      { h: "h4" },
      { ul: ["l10", "l11", "l12"] },
      { h: "h5" },
      { ul: ["l13"] },
    ],
  },
  {
    id: "privacy-storage",
    key: "s4",
    blocks: [{ p: "p1" }, { ul: ["l1", "l2"] }, { p: "p2" }],
  },
  {
    id: "privacy-third-parties",
    key: "s5",
    blocks: [{ p: "p1" }, { ul: ["l1", "l2", "l3", "l4", "l5", "l6"] }, { p: "p1b" }, { p: "p2" }],
  },
  {
    id: "privacy-tools",
    key: "s6",
    blocks: [{ p: "p1" }, { ul: ["l1", "l2", "l3"] }],
  },
  {
    id: "privacy-cookies",
    key: "s7",
    blocks: [{ p: "p1" }, { ul: ["l1", "l2", "l3", "l4"] }],
  },
  {
    id: "privacy-retention",
    key: "s8",
    blocks: [{ ul: ["l1", "l2", "l3", "l4", "l5"] }],
  },
  {
    id: "privacy-rights",
    key: "s9",
    blocks: [{ p: "p1" }, { ul: ["l1", "l2", "l3", "l4", "l5"] }, { p: "p2" }],
  },
  {
    id: "privacy-children",
    key: "s10",
    blocks: [{ p: "p1" }],
  },
  {
    id: "privacy-changes",
    key: "s11",
    blocks: [{ p: "p1" }],
  },
  {
    id: "privacy-contact",
    key: "s12",
    blocks: [{ mail: true as const }],
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      ns="legal.privacy"
      seeAlso="legal.privacy.seeAlso"
      email={PRIVACY_EMAIL}
      sections={SECTIONS}
    />
  );
}
