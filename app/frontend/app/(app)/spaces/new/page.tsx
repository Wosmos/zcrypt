import type { Metadata } from "next";
import { SpaceNew } from "@/components/spaces/space-new";

export const metadata: Metadata = {
  title: "New Space",
  description: "Create an end-to-end encrypted shared space and invite people to it.",
};

export default function NewSpacePage() {
  return <SpaceNew />;
}
