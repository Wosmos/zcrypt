import type { Metadata } from "next";
import { SendTool } from "@/components/tools/send-tool";
import { Shield, Lock, Clock, Eye, Zap, Server } from "@/lib/icons";
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
  title: "Send Encrypted Files Free, No Account | zcrypt",
  description:
    "Send files securely with end-to-end AES-256 encryption. No sign-up required. Files are encrypted in your browser before upload. The decryption key never touches our servers. Free encrypted file sharing up to 50 MB.",
  keywords: [
    "encrypted file sharing",
    "send encrypted files",
    "secure file transfer",
    "end to end encrypted file sharing",
    "send files securely",
    "free encrypted file sharing",
    "zero knowledge file sharing",
    "send files no account",
    "AES-256 file encryption",
    "private file sharing",
    "burn after read file sharing",
    "self destructing file share",
    "anonymous file sharing",
    "secure file send",
  ],
  path: "/send",
  ogTitle: "Send Encrypted Files Free, zcrypt",
  ogDescription:
    "Drop a file, get an encrypted link. AES-256 encryption in your browser. No account needed.",
});

const features: ToolFeature[] = [
  { icon: Lock, id: "f1" },
  { icon: Shield, id: "f2" },
  { icon: Clock, id: "f3" },
  { icon: Eye, id: "f4" },
  { icon: Zap, id: "f5" },
  { icon: Server, id: "f6" },
];

export default function SendPublicPage() {
  return (
    <>
      <ToolHero badgeIcon={Lock} base="site.tools.send.hero" />

      <ToolSection maxWidth="max-w-lg">
        <SendTool />
      </ToolSection>

      <ToolBand
        id="send-how"
        titleKey="site.tools.send.how.title"
        ledeKey="site.tools.send.how.lede"
      >
        <StepGrid base="site.tools.send.how" />
      </ToolBand>

      <FeatureGrid id="send-features" base="site.tools.send.features" features={features} />

      <ToolCta base="site.tools.send.cta" />
    </>
  );
}
