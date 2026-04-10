import type { Metadata } from "next";

export function generateStaticParams() {
  return [];
}

export const metadata: Metadata = {
  title: "Shared File",
  robots: { index: false, follow: false },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)] p-4">
      {children}
    </main>
  );
}
