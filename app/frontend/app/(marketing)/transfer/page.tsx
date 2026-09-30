import type { Metadata } from "next";
import { TransferTool } from "@/components/tools/transfer-tool";
import { Shield, Lock, Zap, MonitorSmartphone, Wifi, Server } from "@/lib/icons";
import { MarketingCard } from "@/components/marketing/ui/card";
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
    "Stream encrypted files directly between devices with a 6-digit code. Peer-to-peer AES-256 encrypted transfer over WebSocket. No file size limit, no storage, no accounts. Phone to laptop, any device to any device.",
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
    "Stream encrypted files directly between any two devices. 6-digit code, no storage, no limits.",
});

const features: ToolFeature[] = [
  {
    icon: MonitorSmartphone,
    title: "Device to device",
    desc: "Stream files directly between any two devices with a browser. Phone to laptop, laptop to desktop, any combination.",
  },
  {
    icon: Lock,
    title: "End-to-end encrypted",
    desc: "Files are encrypted with AES-256-GCM before streaming. The relay server handles only encrypted bytes.",
  },
  {
    icon: Zap,
    title: "Real-time streaming",
    desc: "Files transfer as a live stream over WebSocket. No waiting for uploads to finish before downloading.",
  },
  {
    icon: Wifi,
    title: "No file size limit",
    desc: "Transfer files of any size. The data streams in 64 KB encrypted chunks, so memory usage stays low.",
  },
  {
    icon: Shield,
    title: "Nothing stored",
    desc: "Zero data is stored on the server. Once the transfer is complete, there is no trace of the file.",
  },
  {
    icon: Server,
    title: "6-digit code",
    desc: "Pair devices with a simple 6-digit code or QR scan. No accounts, no apps, no configuration.",
  },
];

function RoleSteps({ label, steps }: { label: string; steps: string[] }) {
  return (
    <MarketingCard as="div" size="sm" className="p-6 sm:p-7">
      <h3 className="pv2-h3 flex items-center gap-3">
        <span className="pv2-ic corner-squircle text-base font-bold" aria-hidden="true">
          {label[0]}
        </span>
        {label}
      </h3>
      <ol className="mt-5 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="pv2-body flex gap-3">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-1)] text-[10px] font-medium">
              {i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </MarketingCard>
  );
}

export default function TransferPublicPage() {
  return (
    <>
      <ToolHero
        badgeIcon={Wifi}
        badgeLabel="Peer-to-peer encrypted"
        titleLead="Transfer files between devices."
        titleAccent="Encrypted in real time."
        subtitle="Stream encrypted files directly from one device to another. No storage, no accounts, no file size limits. Connected by a 6-digit code, secured by AES-256 encryption."
      />

      {/* Tool */}
      <ToolSection maxWidth="max-w-lg">
        <TransferTool />
      </ToolSection>

      {/* How it works */}
      <ToolBand
        title="How encrypted transfer works"
        lede="Two devices. One code. Zero data stored."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <RoleSteps
            label="Sender"
            steps={[
              "Select a file to send",
              "A unique encryption key and 6-digit code are generated",
              "Share the code with the receiver",
              "Once paired, the file streams encrypted chunks over WebSocket",
            ]}
          />
          <RoleSteps
            label="Receiver"
            steps={[
              "Enter the 6-digit code or scan the QR code",
              "Connect to the sender via encrypted WebSocket",
              "Receive and decrypt each chunk in real time",
              "File automatically downloads when complete",
            ]}
          />
        </div>
      </ToolBand>

      {/* Features grid */}
      <FeatureGrid heading="Why use encrypted transfer?" features={features} />

      {/* CTA */}
      <ToolCta
        heading="Need persistent cloud storage?"
        description="Create a free zcrypt account for 10 GB of encrypted cloud storage with file versioning, encrypted notes, and more."
      />
    </>
  );
}
