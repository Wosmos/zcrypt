import { LegalDocument } from "@/components/legal/legal-body";
import { LEGAL_EMAIL } from "@/lib/site";

const SECTIONS = [
  {
    id: "code-signing-status",
    key: "s1",
    blocks: [{ p: "status" }, { p: "p1" }],
  },
  {
    id: "code-signing-scope",
    key: "s2",
    blocks: [{ p: "p1" }, { ul: ["l1", "l2", "l3", "l4"] }],
  },
  {
    id: "code-signing-process",
    key: "s3",
    blocks: [{ ul: ["l1", "l2", "l3", "l4", "l5"] }],
  },
  {
    id: "code-signing-team",
    key: "s4",
    blocks: [{ p: "p1" }, { ul: ["l1", "l2", "l3"] }, { p: "p2" }],
  },
  {
    id: "code-signing-privacy",
    key: "s5",
    blocks: [{ p: "p1" }, { ul: ["l1", "l2", "l3"] }, { p: "p2" }],
  },
  {
    id: "code-signing-install",
    key: "s6",
    blocks: [{ p: "p1" }],
  },
  {
    id: "code-signing-contact",
    key: "s7",
    blocks: [{ mail: true as const }],
  },
];

export default function CodeSigningPage() {
  return (
    <LegalDocument
      ns="legal.codeSigning"
      seeAlso="legal.codeSigning.seeAlso"
      email={LEGAL_EMAIL}
      sections={SECTIONS}
    />
  );
}
