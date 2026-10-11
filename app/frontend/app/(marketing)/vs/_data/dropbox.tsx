import { Lock, Shield, HardDrive, Github } from "@/lib/icons";
import type { VsData } from "@/components/marketing/features/comparison-page";
import { VS_RELATED_LINKS, vsBreadcrumb } from "./shared";

export const dropbox: VsData = {
  ns: "dropbox",
  otherName: "Dropbox",
  owner: "Dropbox, Inc.",
  heroSecondaryHref: "/features/encrypted-drive",
  pillars: [
    { Icon: Lock, id: "keys" },
    { Icon: Shield, id: "locked" },
    { Icon: HardDrive, id: "byos" },
    { Icon: Github, id: "openSource" },
  ],
  rows: [
    { id: "encryption", otherGood: false },
    { id: "zeroKnowledge", otherGood: false },
    { id: "storage", otherGood: true },
    { id: "free", otherGood: false },
    { id: "openSource", otherGood: false },
    { id: "selfHost", otherGood: false },
    { id: "folders", otherGood: true },
    { id: "previews", otherGood: true },
    { id: "sharing", otherGood: true },
    { id: "lockIn", otherGood: false },
  ],
  paragraphs: 5,
  related: VS_RELATED_LINKS,
  breadcrumb: vsBreadcrumb("dropbox", "zcrypt vs Dropbox"),
};
