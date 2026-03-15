import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Our Philosophy — Why We Built zcrypt",
  description:
    "The zcrypt manifesto. Why cloud storage is overpriced, why zero-knowledge encryption matters, and why your data should belong to you. Open source, free, and private.",
  alternates: {
    canonical: "https://zcrypt.cloud/philosophy",
  },
  openGraph: {
    title: "Our Philosophy — Why We Built zcrypt",
    description:
      "The zcrypt manifesto. Cloud storage is overpriced. Your data should belong to you.",
    url: "https://zcrypt.cloud/philosophy",
  },
};

export default function PhilosophyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
