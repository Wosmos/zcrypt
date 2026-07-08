import { OG_ALT, OG_SIZE, renderBrandOgCard } from "@/lib/og-brand";

export const dynamic = "force-static";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function TwitterImage() {
  return renderBrandOgCard({ variant: "twitter" });
}
