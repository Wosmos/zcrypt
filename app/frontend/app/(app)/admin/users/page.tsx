import type { Metadata } from "next";
import { AdminUsersContent } from "@/components/admin/users-content";

export const metadata: Metadata = {
  title: "Admin · Users",
  description: "Manage user roles, plans, and storage quotas.",
};

export default function AdminUsersPage() {
  return <AdminUsersContent />;
}
