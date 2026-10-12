import { pageMetadata } from "@/lib/page-metadata";
import { ComparisonPage } from "@/components/marketing/features/comparison-page";
import { dropbox } from "../_data/dropbox";

export const metadata = pageMetadata({
  title: "zcrypt vs Dropbox: Private, Open-Source Encrypted Drive",
  description:
    "A fair, accurate comparison of zcrypt and Dropbox. zcrypt is a free, open-source, zero-knowledge encrypted drive where you hold the keys and bring your own storage. Dropbox is a convenient, proprietary host that can access your files by default.",
  path: "/vs/dropbox",
  keywords: [
    "dropbox alternative",
    "zero-knowledge dropbox alternative",
    "encrypted dropbox alternative",
    "open source dropbox alternative",
    "private cloud storage",
    "zcrypt vs dropbox",
    "end-to-end encrypted file storage",
  ],
  ogTitle: "zcrypt vs Dropbox: Private, Open-Source Encrypted Drive",
  ogDescription:
    "zcrypt is zero-knowledge by default, open source, and stores files in accounts you already own. See how it compares to Dropbox, fairly.",
});

export default function VsDropboxPage() {
  return <ComparisonPage {...dropbox} />;
}
