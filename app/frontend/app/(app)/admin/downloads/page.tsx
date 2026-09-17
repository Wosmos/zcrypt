import type { Metadata } from "next";
import { DownloadsContent } from "@/components/admin/downloads-content";

export const metadata: Metadata = {
  title: "Admin · Downloads",
  description: "Installer downloads of the zcrypt app, by platform, version and country.",
};

export default function AdminDownloadsPage() {
  return <DownloadsContent />;
}
