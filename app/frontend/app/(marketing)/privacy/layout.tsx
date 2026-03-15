import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "zcrypt privacy policy. How we handle your data with zero-knowledge encryption. We cannot access your files — by design.",
  alternates: {
    canonical: "https://zcrypt.cloud/privacy",
  },
  openGraph: {
    title: "Privacy Policy — zcrypt",
    description:
      "How zcrypt handles your data. Zero-knowledge encryption means we cannot access your files.",
    url: "https://zcrypt.cloud/privacy",
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
