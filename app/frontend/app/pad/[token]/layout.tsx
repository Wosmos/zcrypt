import { tokenMetadata, TokenViewerMain } from "@/components/tokens/token-layout";

export { generateStaticParams } from "@/components/tokens/token-layout";

export const metadata = tokenMetadata("zcrypt Pad — Encrypted Text");

export default function PadViewLayout({ children }: { children: React.ReactNode }) {
  return <TokenViewerMain>{children}</TokenViewerMain>;
}
