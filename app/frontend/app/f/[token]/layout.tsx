import type { Metadata } from "next";

// See s/[token]/layout.tsx: output:export needs a non-empty param set; the
// page is client-rendered and stripped from the desktop bundle.
export function generateStaticParams() {
  return [{ token: "placeholder" }];
}

export const metadata: Metadata = {
  title: "Shared Folder",
  robots: { index: false, follow: false },
};

export default function FolderShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)] p-4">
      {children}
    </main>
  );
}
