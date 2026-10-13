import DemoClient from "./demo-client";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Live Demo",
  description:
    "Experience the ultimate speed and zero-knowledge encryption with zcrypt's live interactive demo.",
  path: "/demo",
});

export default function DemoPage() {
  return <DemoClient />;
}
