import { tokenMetadata, TokenViewerMain } from "@/components/tokens/token-layout";

export { generateStaticParams } from "@/components/tokens/token-layout";

export const metadata = tokenMetadata("Shared Folder");

export default function FolderShareLayout({ children }: { children: React.ReactNode }) {
  return <TokenViewerMain>{children}</TokenViewerMain>;
}
