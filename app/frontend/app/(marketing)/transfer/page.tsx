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
  {
    icon: MonitorSmartphone,
    title: "Device to device",
    desc: "Send files between any two devices with a browser. Phone to laptop, laptop to desktop, any combination.",
  },
  {
    icon: Lock,
    title: "End-to-end encrypted",
    desc: "Files and filenames are encrypted with AES-256-GCM on your device. The key is shared by QR code, link or pairing key and never reaches the relay, which only sees ciphertext.",
  },
  {
    icon: Zap,
    title: "Real-time streaming",
    desc: "Files are relayed live over WebSocket as they are encrypted. No waiting for an upload to finish first.",
  },
  {
    icon: Wifi,
    title: "Sent in small chunks",
    desc: "The sender encrypts and sends 64 KB chunks, so sending stays light. The receiving browser holds the whole file in memory until it saves, so very large files need a device with room for them.",
  },
  {
    icon: Shield,
    title: "Nothing stored",
    desc: "The relay keeps nothing on disk and forgets the room when the transfer ends. It does see that a transfer happened, its timing and its approximate size.",
  },
  {
    icon: Server,
    title: "Code, key and confirmation",
    desc: "A 6-digit code finds the room and a separate pairing key (in the QR code or link) encrypts the file. Both screens show the same confirmation code. No accounts, no apps.",
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
        subtitle="Stream encrypted files directly from one device to another. No storage, no accounts. Found by a 6-digit code, encrypted with a key the server never sees."
      />

      {/* Tool */}
      <ToolSection maxWidth="max-w-lg">
        <TransferTool />
      </ToolSection>

      {/* How it works */}
      <ToolBand
        title="How encrypted transfer works"
        lede="Two devices. One code. One key that stays off the server."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <RoleSteps
            label="Sender"
            steps={[
              "Select a file to send",
              "A random pairing key and a 6-digit room code are generated",
              "Show the QR code or link to the receiver, or read out the code and pairing key",
              "Check that both screens show the same confirmation code",
              "The file and its name are encrypted on your device and relayed as ciphertext",
            ]}
          />
          <RoleSteps
            label="Receiver"
            steps={[
              "Scan the QR code, or enter the 6-digit code and pairing key",
              "Connect through the relay and compare the confirmation code",
              "Each chunk is decrypted in your browser as it arrives",
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
