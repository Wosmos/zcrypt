import { Eye, FolderOpen } from "@/lib/icons";
import type { VsData } from "@/components/marketing/features/comparison-page";
import { SITE_URL } from "@/lib/site";

export const VS_RELATED_LINKS: VsData["related"] = [
  { href: "/features/encrypted-drive", Icon: FolderOpen, id: "drive" },
  { href: "/features/encryption", Icon: Eye, id: "encryption" },
];

export function vsBreadcrumb(slug: string, name: string): VsData["breadcrumb"] {
  const url = `${SITE_URL}/vs/${slug}`;
  return [
    { name: "Home", url: SITE_URL },
    { name: "Compare", url },
    { name, url },
  ];
}
