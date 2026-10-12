export const metadata = pageMetadata({
  title: "Terms of Service",
  description:
    "zcrypt terms of service. The rules for using our zero-knowledge encrypted cloud storage platform.",
  path: "/terms",
  ogTitle: "Terms of Service, zcrypt",
  ogDescription: "Terms of service for using zcrypt encrypted cloud storage.",
});

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
import { pageMetadata } from "@/lib/page-metadata";
