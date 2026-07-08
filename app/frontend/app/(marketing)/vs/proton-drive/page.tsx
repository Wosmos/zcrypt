import type { Metadata } from "next";
import { ComparisonPage } from "@/components/marketing/features/comparison-page";
import { protonDrive } from "../_data/proton-drive";

export const metadata: Metadata = {
  title: "zcrypt vs Proton Drive: Private, Open-Source Encrypted Drive",
  description:
    "A fair comparison of two end-to-end encrypted drives. Proton Drive is audited, established, and has mobile apps. zcrypt adds open-source self-hosting, bring-your-own-storage, no artificial caps, and a terminal app — all free.",
  keywords: [
    "proton drive alternative",
    "open source proton drive alternative",
    "self-hosted proton drive alternative",
    "zero-knowledge cloud storage",
    "encrypted cloud drive",
    "zcrypt vs proton drive",
    "bring your own storage encrypted drive",
  ],
  alternates: { canonical: "https://zcrypt.cloud/vs/proton-drive" },
  openGraph: {
    title: "zcrypt vs Proton Drive: Private, Open-Source Encrypted Drive",
    description:
      "Both are end-to-end encrypted. zcrypt adds open-source self-hosting, bring-your-own-storage, no caps, and a terminal app. A fair look at both.",
    url: "https://zcrypt.cloud/vs/proton-drive",
    type: "website",
  },
};

export default function VsProtonDrivePage() {
  return <ComparisonPage {...protonDrive} />;
}
