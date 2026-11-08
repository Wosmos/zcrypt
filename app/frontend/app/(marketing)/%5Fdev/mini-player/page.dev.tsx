import { notFound } from "next/navigation";
import { MiniPlayerHarness } from "./harness";

export const metadata = { title: "Mini player harness", robots: { index: false, follow: false } };

/** Dev-only: the mini player fed generated audio and video, no vault needed. */
export default function MiniPlayerHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MiniPlayerHarness />;
}
