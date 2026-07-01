import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SendCard } from "@/components/share/send-card";
import { PadCard } from "@/components/share/pad-card";

export const metadata: Metadata = {
  title: "Share",
  description: "Send encrypted files and share text snippets.",
};

export default function SharePage() {
  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader
        eyebrow="Sharing"
        title="Share"
        description="Send encrypted files to anyone, or share a text snippet. To collaborate with a team, use Spaces."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SendCard />
        <PadCard />
      </div>
    </div>
  );
}
