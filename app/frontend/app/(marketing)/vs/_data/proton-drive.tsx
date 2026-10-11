import { Lock, HardDrive, Github } from "@/lib/icons";
import type { VsData } from "@/components/marketing/features/comparison-page";
import { VS_RELATED_LINKS, vsBreadcrumb } from "./shared";

export const protonDrive: VsData = {
  ns: "protonDrive",
  otherName: "Proton Drive",
  owner: "Proton AG",
  heroSecondaryHref: "/features/encryption",
  respectNote: true,
  pillarsHeadLede: true,
  pillars: [
    { Icon: Github, id: "openSource" },
    { Icon: HardDrive, id: "byos" },
    { Icon: Lock, id: "selfHost" },
  ],
  rows: [
    { id: "encryption", otherGood: true },
    { id: "zeroKnowledge", zcryptOwn: true, otherGood: true },
    { id: "storage", otherGood: true },
    { id: "free", zcryptOwn: true, otherGood: true },
    { id: "openSource", zcryptOwn: true, otherGood: true },
    { id: "selfHost", zcryptOwn: true, otherGood: false },
    { id: "folders", zcryptOwn: true, otherGood: true },
    { id: "previews", zcryptOwn: true, otherGood: true },
    { id: "sharing", otherGood: true },
    { id: "lockIn", zcryptOwn: true, otherGood: false },
  ],
  paragraphs: 5,
  related: VS_RELATED_LINKS,
  breadcrumb: vsBreadcrumb("proton-drive", "zcrypt vs Proton Drive"),
};
