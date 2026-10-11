import type { Metadata } from "next";
import { PadTool } from "@/components/tools/pad-tool";
import { Shield, Lock, Clock, Eye, Zap, FileText } from "@/lib/icons";
import { MarketingCard } from "@/components/marketing/ui/card";
import { T } from "@/components/i18n/t";
import { toolMetadata } from "@/lib/tool-metadata";
import {
  ToolHero,
  ToolSection,
  ToolBand,
  StepGrid,
  FeatureGrid,
  ToolCta,
  type ToolFeature,
} from "@/components/tools/tool-page-shell";

export const metadata: Metadata = toolMetadata({
  title: "Encrypted Text Pad. Share Passwords & Secrets Securely | zcrypt",
  description:
    "Zero-knowledge encrypted text sharing. Paste text, get an encrypted link. The decryption key never leaves your browser. Perfect for sharing passwords, API keys, and sensitive notes. Auto-expiry and burn-after-read.",
  keywords: [
    "encrypted text sharing",
    "secure text pad",
    "encrypted notepad",
    "share passwords securely",
    "zero knowledge text sharing",
    "encrypted pastebin",
    "secure pastebin alternative",
    "burn after read",
    "self destructing notes",
    "share API keys securely",
    "encrypted note sharing",
    "private text pad",
    "anonymous text sharing",
    "one time secret",
  ],
  path: "/pad",
  ogTitle: "Encrypted Text Pad, zcrypt",
  ogDescription:
    "Zero-knowledge encrypted text sharing. Paste, encrypt, share. The server never sees your plaintext.",
});

const features: ToolFeature[] = [
  { icon: Lock, id: "f1" },
  { icon: Shield, id: "f2" },
  { icon: Clock, id: "f3" },
  { icon: Eye, id: "f4" },
  { icon: Zap, id: "f5" },
  { icon: FileText, id: "f6" },
];

export default function PadPublicPage() {
  return (
    <>
      <ToolHero badgeIcon={Shield} base="site.tools.pad.hero" />

      <ToolSection maxWidth="max-w-2xl">
        <PadTool />
      </ToolSection>

      <ToolBand id="pad-how" titleKey="site.tools.pad.how.title" ledeKey="site.tools.pad.how.lede">
        <StepGrid base="site.tools.pad.how" />
      </ToolBand>

      <FeatureGrid id="pad-features" base="site.tools.pad.features" features={features} />

      <ToolBand id="pad-use-cases" titleKey="site.tools.pad.useCases.title">
        <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {["c1", "c2", "c3", "c4"].map((c) => (
            <MarketingCard key={c} as="li" size="sm" className="p-6">
              <h3 className="pv2-h3">
                <T k={`site.tools.pad.useCases.${c}.title`} />
              </h3>
              <p className="pv2-body mt-2">
                <T k={`site.tools.pad.useCases.${c}.desc`} />
              </p>
            </MarketingCard>
          ))}
        </ul>
      </ToolBand>

      <ToolCta base="site.tools.pad.cta" />
    </>
  );
}
