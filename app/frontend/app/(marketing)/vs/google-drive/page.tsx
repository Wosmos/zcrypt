import { pageMetadata } from "@/lib/page-metadata";
import { ComparisonPage } from "@/components/marketing/features/comparison-page";
import { googleDrive } from "../_data/google-drive";

export const metadata = pageMetadata({
  title: "zcrypt vs Google Drive: Private, Open-Source Encrypted Drive",
  description:
    "A fair comparison of zcrypt and Google Drive. zcrypt is a free, open-source, zero-knowledge encrypted drive where only you can read your files. Google Drive is deeply integrated and convenient, but not end-to-end encrypted and able to scan your content.",
  path: "/vs/google-drive",
  keywords: [
    "google drive alternative",
    "encrypted google drive alternative",
    "zero-knowledge google drive alternative",
    "open source google drive alternative",
    "private cloud storage",
    "zcrypt vs google drive",
    "end-to-end encrypted storage",
  ],
  ogTitle: "zcrypt vs Google Drive: Private, Open-Source Encrypted Drive",
  ogDescription:
    "zcrypt is zero-knowledge by default, open source, and stores files in accounts you already own. See how it compares to Google Drive, fairly.",
});

export default function VsGoogleDrivePage() {
  return <ComparisonPage {...googleDrive} />;
}
