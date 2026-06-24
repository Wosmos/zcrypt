import type { Metadata } from "next";
import { SettingsContent } from "@/components/settings/settings-content";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage appearance, connected accounts, storage platforms, and privacy controls.",
};

export default function SettingsPage() {
  return <SettingsContent />;
}
