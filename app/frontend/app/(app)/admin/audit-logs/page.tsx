import type { Metadata } from "next";
import { AuditLog } from "@/components/admin/audit-log";

export const metadata: Metadata = {
  title: "Admin · Audit logs",
  description: "Real-time system activity and security events.",
};

export default function AdminAuditLogsPage() {
  return <AuditLog />;
}
