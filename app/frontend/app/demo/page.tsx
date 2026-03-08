import { Metadata } from "next";
import DemoClient from "./demo-client";

export const metadata: Metadata = {
  title: "Live Demo | zpush",
  description:
    "Experience the ultimate speed and zero-knowledge encryption with zpush's live interactive demo.",
  openGraph: {
    title: "Live Demo | zpush",
    description:
      "Experience the ultimate speed and zero-knowledge encryption with zpush's live interactive demo.",
    url: "https://zpush.io/demo",
  },
};

export default function DemoPage() {
  return <DemoClient />;
}
