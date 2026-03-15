import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "zcrypt terms of service. The rules for using our zero-knowledge encrypted cloud storage platform.",
  alternates: {
    canonical: "https://zcrypt.cloud/terms",
  },
  openGraph: {
    title: "Terms of Service — zcrypt",
    description:
      "Terms of service for using zcrypt encrypted cloud storage.",
    url: "https://zcrypt.cloud/terms",
  },
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
