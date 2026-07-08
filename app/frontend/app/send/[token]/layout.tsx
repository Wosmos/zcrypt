import { tokenMetadata, TokenViewerMain } from "@/components/tokens/token-layout";

export { generateStaticParams } from "@/components/tokens/token-layout";

export const metadata = tokenMetadata("zcrypt Send — Encrypted File");

export default function SendDownloadLayout({ children }: { children: React.ReactNode }) {
  return <TokenViewerMain>{children}</TokenViewerMain>;
}
