import { notFound } from "next/navigation";
import { TransfersHarness } from "./harness";

export const metadata = { title: "Transfers harness", robots: { index: false, follow: false } };

/** Dev-only: the transfer panel seeded with fake transfers in every state. */
export default function TransfersHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TransfersHarness />;
}
