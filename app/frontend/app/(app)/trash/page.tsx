import type { Metadata } from "next";
import { TrashContent } from "@/components/files/trash-content";

export const metadata: Metadata = {
  title: "Deleted Files",
  description: "Restore or permanently delete files in your trash.",
};

export default function TrashPage() {
  return <TrashContent />;
}
