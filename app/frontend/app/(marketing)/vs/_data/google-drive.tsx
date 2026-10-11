import { Lock, Shield, HardDrive, Github } from "@/lib/icons";
import type { VsData } from "@/components/marketing/features/comparison-page";
import { VS_RELATED_LINKS, vsBreadcrumb } from "./shared";

export const googleDrive: VsData = {
  ns: "googleDrive",
  otherName: "Google Drive",
  owner: "Google LLC",
  heroSecondaryHref: "/features/encryption",
  pillars: [
    { Icon: Lock, id: "onlyYou" },
    { Icon: Shield, id: "noScanning" },
    { Icon: HardDrive, id: "byos" },
    { Icon: Github, id: "openSource" },
  ],
  rows: [
    { id: "encryption", otherGood: false },
    { id: "zeroKnowledge", otherGood: false },
    { id: "storage", otherGood: true },
    { id: "free", otherGood: true },
    { id: "openSource", otherGood: false },
    { id: "selfHost", otherGood: false },
    { id: "folders", otherGood: true },
    { id: "previews", otherGood: true },
    { id: "sharing", otherGood: true },
    { id: "lockIn", otherGood: false },
  ],
  paragraphs: 5,
  related: VS_RELATED_LINKS,
  breadcrumb: vsBreadcrumb("google-drive", "zcrypt vs Google Drive"),
};
