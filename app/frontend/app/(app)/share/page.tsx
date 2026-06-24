import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SendCard } from "@/components/share/send-card";
import { PadCard } from "@/components/share/pad-card";
import { SharedVaultsContent } from "@/components/share/shared-vaults-content";

export const metadata: Metadata = {
  title: "Share",
  description:
    "Send encrypted files, share text snippets, and collaborate in shared vaults.",
};

export default function SharePage() {
  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader
        eyebrow="Sharing"
        title="Share"
        description="Send encrypted files to anyone, share text snippets, or collaborate in shared vaults."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SendCard />
        <PadCard />
      </div>

      <SharedVaultsContent />
    </div>
  );
}
