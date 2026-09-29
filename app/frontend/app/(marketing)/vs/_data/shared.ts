import { Eye, FolderOpen } from "@/lib/icons";
import type { VsData } from "@/components/marketing/features/comparison-page";
import { SITE_URL } from "@/lib/site";

export const VS_RELATED_LINKS: VsData["related"] = [
  {
    href: "/features/encrypted-drive",
    Icon: FolderOpen,
    title: "The drive itself",
    desc: "Real folders, search, and previews, with zero-knowledge encryption underneath.",
  },
  {
    href: "/features/encryption",
    Icon: Eye,
    title: "How the locking works",
    desc: "AES-256-GCM, keys made on your device, and what the server can and can't see.",
  },
];

export function vsBreadcrumb(slug: string, name: string): VsData["breadcrumb"] {
  const url = `${SITE_URL}/vs/${slug}`;
  return [
    { name: "Home", url: SITE_URL },
    { name: "Compare", url },
    { name, url },
  ];
}
