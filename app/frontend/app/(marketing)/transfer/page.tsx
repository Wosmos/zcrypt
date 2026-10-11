import type { Metadata } from "next";
import { TransferTool } from "@/components/tools/transfer-tool";
import { Shield, Lock, Zap, MonitorSmartphone, Wifi, Server } from "@/lib/icons";
import { RoleSteps } from "@/components/tools/role-steps";
import { toolMetadata } from "@/lib/tool-metadata";
import {
  ToolHero,
  ToolSection,
  ToolBand,
  FeatureGrid,
  ToolCta,
  type ToolFeature,
} from "@/components/tools/tool-page-shell";

export const metadata: Metadata = toolMetadata({
  title: "Transfer Files Between Devices. Encrypted P2P File Transfer | zcrypt",
  description:
    "Send encrypted files between devices with a 6-digit code and a pairing key. AES-256 encrypted in your browser, relayed over WebSocket, never stored. No accounts. Phone to laptop, any device to any device.",
  keywords: [
    "peer to peer file transfer",
    "encrypted file transfer",
    "device to device file transfer",
    "P2P file sharing",
    "send files between devices",
    "transfer files phone to laptop",
    "encrypted P2P transfer",
    "WebSocket file transfer",
    "no size limit file transfer",
    "free file transfer between devices",
    "secure file transfer",
    "direct file transfer",
    "QR code file transfer",
    "airdrop alternative",
  ],
  path: "/transfer",
  ogTitle: "Transfer Files Between Devices, zcrypt",
  ogDescription:
    "Send encrypted files between any two devices. Pairing key stays off the server, nothing stored.",
});

const features: ToolFeature[] = [
  { icon: MonitorSmartphone, id: "f1" },
  { icon: Lock, id: "f2" },
  { icon: Zap, id: "f3" },
  { icon: Wifi, id: "f4" },
  { icon: Shield, id: "f5" },
  { icon: Server, id: "f6" },
];

export default function TransferPublicPage() {
  return (
    <>
      <ToolHero badgeIcon={Wifi} base="site.tools.transfer.hero" />

      <ToolSection maxWidth="max-w-lg">
        <TransferTool />
      </ToolSection>

      <ToolBand
        id="transfer-how"
        titleKey="site.tools.transfer.how.title"
        ledeKey="site.tools.transfer.how.lede"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <RoleSteps base="site.tools.transfer.sender" count={5} />
          <RoleSteps base="site.tools.transfer.receiver" count={4} />
        </div>
      </ToolBand>

      <FeatureGrid
        id="transfer-features"
        base="site.tools.transfer.features"
        accent={false}
        features={features}
      />

      <ToolCta base="site.tools.transfer.cta" />
    </>
  );
}
