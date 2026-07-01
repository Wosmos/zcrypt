import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SharedVaultsContent } from "@/components/share/shared-vaults-content";

export const metadata: Metadata = {
  title: "Spaces",
  description:
    "Collaborate on end-to-end encrypted files in shared spaces. Invite people, set a size limit, and stay zero-knowledge.",
};

export default function SpacesPage() {
  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader
        eyebrow="Collaboration"
        title="Spaces"
        description="Share encrypted files with people you invite. The space key is sealed to each member's key — the server never sees it."
      />

      <SharedVaultsContent />
    </div>
  );
}
