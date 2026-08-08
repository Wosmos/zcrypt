import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "zcrypt privacy policy. How we handle your data with zero-knowledge encryption. We cannot access your files — by design.",
  alternates: {
    canonical: `${SITE_URL}/privacy`,
  },
  openGraph: {
    title: "Privacy Policy — zcrypt",
    description:
      "How zcrypt handles your data. Zero-knowledge encryption means we cannot access your files.",
    url: `${SITE_URL}/privacy`,
  },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
