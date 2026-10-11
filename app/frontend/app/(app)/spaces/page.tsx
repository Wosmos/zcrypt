import type { Metadata } from "next";
import { SpacesList } from "@/components/spaces/spaces-list";

export const metadata: Metadata = {
  title: "Spaces",
  description:
    "Collaborate on end-to-end encrypted files in shared spaces. Invite people, set a size limit, and stay zero-knowledge.",
};

export default function SpacesPage() {
  return <SpacesList />;
}
