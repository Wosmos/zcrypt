import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminEmailsContent } from "@/components/admin/emails-content";

export const metadata: Metadata = {
  title: "Admin · Emails",
  description: "Send announcements to your users.",
};

export default function AdminEmailsPage() {
  return (
    <Suspense>
      <AdminEmailsContent />
    </Suspense>
  );
}
