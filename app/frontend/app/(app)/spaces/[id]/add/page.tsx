import type { Metadata } from "next";
import { SpaceAdd } from "@/components/spaces/space-add";

export const metadata: Metadata = {
  title: "Add files to Space",
  description: "Choose files from your vault to share into a space.",
};

export default function SpaceAddPage() {
  return <SpaceAdd />;
}
