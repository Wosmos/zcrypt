import type { Metadata } from "next";
import { DecoyContent } from "@/components/settings/decoy-content";

export const metadata: Metadata = {
  title: "Decoy Profile",
  description: "Plausible deniability with a decoy password and fake vault.",
};

export default function DecoySettingsPage() {
  return <DecoyContent />;
}
