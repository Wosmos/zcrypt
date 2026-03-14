import { Metadata } from "next";
import DemoClient from "./demo-client";

export const metadata: Metadata = {
  title: "Live Demo | zcrypt",
  description:
    "Experience the ultimate speed and zero-knowledge encryption with zcrypt's live interactive demo.",
  openGraph: {
    title: "Live Demo | zcrypt",
    description:
      "Experience the ultimate speed and zero-knowledge encryption with zcrypt's live interactive demo.",
    url: "https://zcrypt.cloud/demo",
  },
};

export default function DemoPage() {
  return <DemoClient />;
}
