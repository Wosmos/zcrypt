import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { TransferTool } from "@/components/tools/transfer-tool";
import { Shield, Lock, Zap, MonitorSmartphone, Wifi, Server } from "@/lib/icons";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Transfer Files Between Devices — Encrypted P2P File Transfer | zcrypt",
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
  alternates: { canonical: "https://zcrypt.cloud/transfer" },
  openGraph: {
    title: "Transfer Files Between Devices — zcrypt",
    description:
      "Stream encrypted files directly between any two devices. 6-digit code, no storage, no limits.",
    url: "https://zcrypt.cloud/transfer",
  },
  twitter: {
    card: "summary_large_image",
    title: "Transfer Files Between Devices — zcrypt",
    description:
      "Stream encrypted files directly between any two devices. 6-digit code, no storage, no limits.",
  },
};

const features = [
  { icon: MonitorSmartphone, title: "Device to device", desc: "Stream files directly between any two devices with a browser. Phone to laptop, laptop to desktop — any combination." },
  { icon: Lock, title: "End-to-end encrypted", desc: "Files are encrypted with AES-256-GCM before streaming. The relay server handles only encrypted bytes." },
  { icon: Zap, title: "Real-time streaming", desc: "Files transfer as a live stream over WebSocket. No waiting for uploads to finish before downloading." },
  { icon: Wifi, title: "No file size limit", desc: "Transfer files of any size. The data streams in 64 KB encrypted chunks, so memory usage stays low." },
  { icon: Shield, title: "Nothing stored", desc: "Zero data is stored on the server. Once the transfer is complete, there is no trace of the file." },
  { icon: Server, title: "6-digit code", desc: "Pair devices with a simple 6-digit code or QR scan. No accounts, no apps, no configuration." },
];

export default function TransferPublicPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[var(--color-bg)]">
      <MarketingNav />

      <main className="flex-1">
        {/* Hero */}
        <section className="pt-28 pb-8 sm:pt-32 sm:pb-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text-muted)] mb-6">
              <Wifi className="h-3 w-3 text-[var(--color-accent)]" />
              Peer-to-peer encrypted
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold font-heading tracking-tight leading-tight">
              Transfer files between devices.{" "}
              <span className="text-[var(--color-accent)]">Encrypted in real time.</span>
            </h1>
            <p className="mt-4 text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto leading-relaxed">
              Stream encrypted files directly from one device to another. No storage, no accounts, no file size limits.
              Connected by a 6-digit code, secured by AES-256 encryption.
            </p>
          </div>
        </section>

        {/* Tool */}
        <section className="pb-16 sm:pb-20">
          <div className="mx-auto max-w-lg px-4 sm:px-6">
            <TransferTool />
          </div>
        </section>

        {/* How it works */}
        <section className="py-16 sm:py-20 border-t border-[var(--color-border)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight text-center mb-4">
              How encrypted transfer works
            </h2>
            <p className="text-center text-[var(--color-text-secondary)] mb-12 max-w-xl mx-auto">
              Two devices. One code. Zero data stored.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Sender side */}
              <div className="p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-sm font-bold">S</div>
                  Sender
                </h3>
                <ol className="space-y-3">
                  {[
                    "Select a file to send",
                    "A unique encryption key and 6-digit code are generated",
                    "Share the code with the receiver",
                    "Once paired, the file streams encrypted chunks over WebSocket",
                  ].map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm text-[var(--color-text-secondary)]">
                      <span className="flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-[var(--color-surface-1)] text-[10px] font-medium">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Receiver side */}
              <div className="p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
                  <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-cyan-500/10 text-cyan-500 text-sm font-bold">R</div>
                  Receiver
                </h3>
                <ol className="space-y-3">
                  {[
                    "Enter the 6-digit code or scan the QR code",
                    "Connect to the sender via encrypted WebSocket",
                    "Receive and decrypt each chunk in real time",
                    "File automatically downloads when complete",
                  ].map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm text-[var(--color-text-secondary)]">
                      <span className="flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-[var(--color-surface-1)] text-[10px] font-medium">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section className="py-16 sm:py-20 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight text-center mb-12">
              Why use encrypted transfer?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f) => (
                <div key={f.title} className="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
                  <f.icon className="h-5 w-5 text-[var(--color-accent)] mb-3" />
                  <h3 className="text-sm font-semibold mb-1">{f.title}</h3>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-20 border-t border-[var(--color-border)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight mb-4">
              Need persistent cloud storage?
            </h2>
            <p className="text-[var(--color-text-secondary)] mb-8 max-w-md mx-auto">
              Create a free zcrypt account for 10 GB of encrypted cloud storage with file versioning, encrypted notes, and more.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/register" className="px-6 py-2.5 text-sm font-semibold bg-[var(--color-text)] text-[var(--color-bg)] rounded-xl hover:opacity-90 transition-opacity">
                Get started free
              </Link>
              <Link href="/features" className="px-6 py-2.5 text-sm font-medium border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-surface-1)] transition-colors">
                See features
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
