export { generateStaticParams } from "@/components/tokens/token-layout";
import { tokenMetadata, TokenViewerMain } from "@/components/tokens/token-layout";

export const metadata = tokenMetadata("Shared File");

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <TokenViewerMain>{children}</TokenViewerMain>;
}

export const dynamicParams = false;
