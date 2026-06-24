import type { Metadata } from "next";
import { DeadManContent } from "@/components/settings/deadman-content";

export const metadata: Metadata = {
  title: "Dead Man's Switch",
  description: "Automatically notify a trusted contact if you stop checking in.",
};

export default function DeadManSwitchPage() {
  return <DeadManContent />;
}
