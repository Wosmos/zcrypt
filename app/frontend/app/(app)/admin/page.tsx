import type { Metadata } from "next";
import { AdminOverviewContent } from "@/components/admin/overview-content";

export const metadata: Metadata = {
  title: "Admin · Overview",
  description: "System stats, platform tokens, and user feedback.",
};

export default function AdminOverviewPage() {
  return <AdminOverviewContent />;
}
