import type { Metadata } from "next";
import { SpaceSettings } from "@/components/spaces/space-settings";

export const metadata: Metadata = {
  title: "Space settings",
  description: "Manage a space's details, members, encryption key and access.",
};

export default function SpaceSettingsPage() {
  return <SpaceSettings />;
}
