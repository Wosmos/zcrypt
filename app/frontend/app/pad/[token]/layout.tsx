import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "zcrypt Pad — Encrypted Text",
  robots: { index: false, follow: false },
};

export default function PadViewLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)] p-4">
      {children}
    </main>
  );
}
