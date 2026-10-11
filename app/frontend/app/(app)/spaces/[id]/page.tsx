import type { Metadata } from "next";
import { SpaceHome } from "@/components/spaces/space-home";

export const metadata: Metadata = {
  title: "Space",
  description: "Files shared in an end-to-end encrypted space.",
};

export default function SpacePage() {
  return <SpaceHome />;
}
