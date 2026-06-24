import type { Metadata } from "next";
import { AnalyticsClient } from "@/components/analytics/analytics-client";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Storage, compression and upload insights for your encrypted library.",
};

export default function AnalyticsPage() {
  return <AnalyticsClient />;
}
