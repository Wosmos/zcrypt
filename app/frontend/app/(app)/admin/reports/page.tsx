import type { Metadata } from "next";
import { BugReports } from "@/components/admin/bug-reports";

export const metadata: Metadata = {
  title: "Admin · Bug reports",
  description: "Bug reports filed from inside the app.",
};

export default function AdminReportsPage() {
  return <BugReports />;
}
