export const metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "zcrypt privacy policy. How we handle your data with zero-knowledge encryption. We cannot access your files, by design.",
  path: "/privacy",
  ogTitle: "Privacy Policy, zcrypt",
  ogDescription:
    "How zcrypt handles your data. Zero-knowledge encryption means we cannot access your files.",
});

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
import { pageMetadata } from "@/lib/page-metadata";
