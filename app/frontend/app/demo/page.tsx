import { Metadata } from "next";
import DemoClient from "./demo-client";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Live Demo | zcrypt",
  description:
    "Experience the ultimate speed and zero-knowledge encryption with zcrypt's live interactive demo.",
  openGraph: {
    title: "Live Demo | zcrypt",
    description:
      "Experience the ultimate speed and zero-knowledge encryption with zcrypt's live interactive demo.",
    url: `${SITE_URL}/demo`,
  },
};

export default function DemoPage() {
  return <DemoClient />;
}
