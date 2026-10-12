import { pageMetadata } from "@/lib/page-metadata";
import { ComparisonPage } from "@/components/marketing/features/comparison-page";
import { protonDrive } from "../_data/proton-drive";

export const metadata = pageMetadata({
  title: "zcrypt vs Proton Drive: Private, Open-Source Encrypted Drive",
  description:
    "A fair comparison of two end-to-end encrypted drives. Proton Drive is audited, established, and has mobile apps. zcrypt adds open-source self-hosting, bring-your-own-storage, and no artificial caps, all free.",
  path: "/vs/proton-drive",
  keywords: [
    "proton drive alternative",
    "open source proton drive alternative",
    "self-hosted proton drive alternative",
    "zero-knowledge cloud storage",
    "encrypted cloud drive",
    "zcrypt vs proton drive",
    "bring your own storage encrypted drive",
  ],
  ogTitle: "zcrypt vs Proton Drive: Private, Open-Source Encrypted Drive",
  ogDescription:
    "Both are end-to-end encrypted. zcrypt adds open-source self-hosting, bring-your-own-storage, and no caps. A fair look at both.",
});

export default function VsProtonDrivePage() {
  return <ComparisonPage {...protonDrive} />;
}
