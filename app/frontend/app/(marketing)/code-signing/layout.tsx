import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Code signing policy",
  description:
    "How zcrypt's Windows installers are built from the public source, who can release them, and when they are signed.",
  path: "/code-signing",
  ogTitle: "Code signing policy, zcrypt",
  ogDescription:
    "Which zcrypt installers are signed, by whom, and how signing requests are approved.",
});

export default function CodeSigningLayout({ children }: { children: React.ReactNode }) {
  return children;
}
