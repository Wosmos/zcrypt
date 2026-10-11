import { LegalDocument } from "@/components/legal/legal-body";
import { LEGAL_EMAIL } from "@/lib/site";

const SECTIONS = [
  {
    id: "terms-who",
    key: "s1",
    blocks: [{ p: "p1" }],
  },
  {
    id: "terms-account",
    key: "s2",
    blocks: [{ ul: ["l1", "l2", "l3"] }],
  },
  {
    id: "terms-service",
    key: "s3",
    blocks: [{ p: "p1" }, { p: "p2" }, { p: "p3" }],
  },
  {
    id: "terms-use",
    key: "s4",
    blocks: [{ p: "p1" }, { ul: ["l1", "l2", "l3", "l4"] }, { p: "p2" }],
  },
  {
    id: "terms-data",
    key: "s5",
    blocks: [{ p: "p1" }, { p: "p2" }, { p: "p3" }],
  },
  {
    id: "terms-ending",
    key: "s6",
    blocks: [{ p: "p1" }],
  },
  {
    id: "terms-liability",
    key: "s7",
    blocks: [{ p: "p1" }],
  },
  {
    id: "terms-changes",
    key: "s8",
    blocks: [{ p: "p1" }],
  },
  {
    id: "terms-contact",
    key: "s9",
    blocks: [{ mail: true as const }],
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      ns="legal.terms"
      seeAlso="legal.terms.seeAlso"
      email={LEGAL_EMAIL}
      sections={SECTIONS}
    />
  );
}
